package app.kanade.player;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Jembatan native Kanade:
 *  - updateMedia / stopMedia : notifikasi media + lock screen + foreground service
 *  - saveToMediaStore        : salin file ke Musik / Film / Gambar agar muncul di galeri
 *  - event "sharedText"      : menerima tautan dari menu Bagikan app lain
 */
@CapacitorPlugin(name = "Kanade")
public class KanadePlugin extends Plugin implements KanadeMediaService.Listener {
    private boolean askedNotif = false;

    @Override
    public void load() {
        KanadeMediaService.listener = this;
        captureShare(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        captureShare(intent);
    }

    private void captureShare(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null || text.isEmpty()) return;
        JSObject o = new JSObject();
        o.put("text", text);
        notifyListeners("sharedText", o, true); // ditahan sampai JS siap
        intent.setAction(null);
    }

    @Override
    public void onMediaAction(String action, double seek) {
        JSObject o = new JSObject();
        o.put("action", action);
        o.put("seek", seek);
        notifyListeners("mediaAction", o);
    }

    @PluginMethod
    public void updateMedia(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && !askedNotif
                && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            askedNotif = true;
            ActivityCompat.requestPermissions(getActivity(), new String[]{Manifest.permission.POST_NOTIFICATIONS}, 7001);
        }
        Intent i = new Intent(getContext(), KanadeMediaService.class).setAction(KanadeMediaService.A_UPDATE);
        i.putExtra("title", call.getString("title", ""));
        i.putExtra("artist", call.getString("artist", ""));
        i.putExtra("artwork", call.getString("artwork", ""));
        i.putExtra("playing", Boolean.TRUE.equals(call.getBoolean("playing", false)));
        i.putExtra("position", call.getDouble("position", 0.0));
        i.putExtra("duration", call.getDouble("duration", 0.0));
        i.putExtra("speed", call.getFloat("speed", 1f));
        try {
            if (KanadeMediaService.running) getContext().startService(i);
            else ContextCompat.startForegroundService(getContext(), i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Tidak bisa memulai layanan media: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopMedia(PluginCall call) {
        if (KanadeMediaService.running) {
            getContext().startService(new Intent(getContext(), KanadeMediaService.class).setAction(KanadeMediaService.A_STOP));
        }
        call.resolve();
    }

    @PluginMethod
    public void saveToMediaStore(final PluginCall call) {
        final String path = call.getString("path");
        final String name = call.getString("name", "file");
        final String mime = call.getString("mime", "application/octet-stream");
        final String kind = call.getString("kind", "photo");
        if (path == null) { call.reject("path kosong"); return; }

        if (Build.VERSION.SDK_INT < 29
                && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(getActivity(), new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, 7002);
            call.reject("Izin penyimpanan diperlukan. Izinkan lalu unduh ulang.");
            return;
        }

        new Thread(() -> {
            try {
                File src = new File(path.startsWith("file://") ? path.substring(7) : path);
                String dir;
                if ("audio".equals(kind)) dir = Environment.DIRECTORY_MUSIC;
                else if ("video".equals(kind)) dir = Environment.DIRECTORY_MOVIES;
                else dir = Environment.DIRECTORY_PICTURES;

                if (Build.VERSION.SDK_INT >= 29) {
                    Uri collection;
                    if ("audio".equals(kind)) collection = MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                    else if ("video".equals(kind)) collection = MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                    else collection = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);

                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, dir + "/Kanade");
                    v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                    ContentResolver r = getContext().getContentResolver();
                    Uri uri = r.insert(collection, v);
                    if (uri == null) throw new Exception("MediaStore menolak file");
                    try (OutputStream out = r.openOutputStream(uri); InputStream in = new FileInputStream(src)) {
                        copy(in, out);
                    }
                    v.clear();
                    v.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    r.update(uri, v, null, null);
                    JSObject res = new JSObject();
                    res.put("uri", uri.toString());
                    call.resolve(res);
                } else {
                    File d = new File(Environment.getExternalStoragePublicDirectory(dir), "Kanade");
                    if (!d.exists() && !d.mkdirs()) throw new Exception("Gagal membuat folder");
                    File out = new File(d, name);
                    int n = 1;
                    while (out.exists()) out = new File(d, n++ + "_" + name);
                    try (OutputStream os = new java.io.FileOutputStream(out); InputStream in = new FileInputStream(src)) {
                        copy(in, os);
                    }
                    MediaScannerConnection.scanFile(getContext(), new String[]{out.getAbsolutePath()}, new String[]{mime}, null);
                    JSObject res = new JSObject();
                    res.put("uri", Uri.fromFile(out).toString());
                    call.resolve(res);
                }
            } catch (Exception e) {
                call.reject("Gagal menyimpan: " + e.getMessage());
            }
        }).start();
    }

    private static void copy(InputStream in, OutputStream out) throws java.io.IOException {
        byte[] buf = new byte[64 * 1024];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        out.flush();
    }
}
