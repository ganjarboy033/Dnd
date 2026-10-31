package app.kanade.player;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** Foreground service: menjaga audio tetap hidup + notifikasi media (MediaStyle) + kontrol lock screen. */
public class KanadeMediaService extends Service {
    public interface Listener { void onMediaAction(String action, double seek); }

    public static Listener listener;
    public static volatile boolean running = false;

    static final String A_UPDATE = "app.kanade.player.UPDATE";
    static final String A_PLAYPAUSE = "app.kanade.player.PLAYPAUSE";
    static final String A_NEXT = "app.kanade.player.NEXT";
    static final String A_PREV = "app.kanade.player.PREV";
    static final String A_STOP = "app.kanade.player.STOP";
    private static final String CHANNEL = "kanade_media";
    private static final int NOTIF_ID = 1001;

    private MediaSession session;
    private final Handler main = new Handler(Looper.getMainLooper());
    private String title = "", artist = "", artUrl = "";
    private Bitmap art;
    private boolean playing = false, fg = false;
    private double position = 0, duration = 0;
    private float speed = 1f;

    @Override
    public void onCreate() {
        super.onCreate();
        running = true;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Pemutar musik", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(ch);
        }
        session = new MediaSession(this, "Kanade");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { fire("play", 0); }
            @Override public void onPause() { fire("pause", 0); }
            @Override public void onSkipToNext() { fire("next", 0); }
            @Override public void onSkipToPrevious() { fire("prev", 0); }
            @Override public void onSeekTo(long pos) { fire("seek", pos / 1000.0); }
        });
        session.setActive(true);
    }

    private void fire(String action, double seek) {
        if (listener != null) listener.onMediaAction(action, seek);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String a = intent == null ? null : intent.getAction();
        if (A_UPDATE.equals(a)) {
            title = intent.getStringExtra("title");
            artist = intent.getStringExtra("artist");
            playing = intent.getBooleanExtra("playing", false);
            position = intent.getDoubleExtra("position", 0);
            duration = intent.getDoubleExtra("duration", 0);
            speed = intent.getFloatExtra("speed", 1f);
            String url = intent.getStringExtra("artwork");
            if (url != null && !url.equals(artUrl)) { artUrl = url; art = null; loadArt(url); }
            render();
        } else if (A_PLAYPAUSE.equals(a)) {
            fire(playing ? "pause" : "play", 0);
        } else if (A_NEXT.equals(a)) {
            fire("next", 0);
        } else if (A_PREV.equals(a)) {
            fire("prev", 0);
        } else if (A_STOP.equals(a)) {
            stopForeground(true);
            fg = false;
            stopSelf();
        } else if (!fg) {
            // Dijalankan sistem tanpa data: wajib tetap memanggil startForeground, lalu berhenti.
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    private void loadArt(final String url) {
        new Thread(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(8000);
                c.setReadTimeout(8000);
                try (InputStream in = c.getInputStream()) {
                    Bitmap b = BitmapFactory.decodeStream(in);
                    if (b != null) {
                        final Bitmap s = Bitmap.createScaledBitmap(b, 512, Math.max(1, b.getHeight() * 512 / b.getWidth()), true);
                        main.post(() -> { if (url.equals(artUrl)) { art = s; render(); } });
                    }
                }
            } catch (Exception ignored) { }
        }).start();
    }

    private PendingIntent action(String a, int code) {
        Intent i = new Intent(this, KanadeMediaService.class).setAction(a);
        return PendingIntent.getService(this, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private void render() {
        long pos = (long) (position * 1000);
        session.setPlaybackState(new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
                        | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_SEEK_TO)
                .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, pos, playing ? speed : 0f)
                .build());
        session.setMetadata(new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
                .putLong(MediaMetadata.METADATA_KEY_DURATION, (long) (duration * 1000))
                .putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, art)
                .build());

        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent content = PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        b.setSmallIcon(android.R.drawable.stat_sys_headset)
                .setContentTitle(title)
                .setContentText(artist)
                .setLargeIcon(art)
                .setContentIntent(content)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOnlyAlertOnce(true)
                .setOngoing(playing)
                .addAction(android.R.drawable.ic_media_previous, "Sebelumnya", action(A_PREV, 1))
                .addAction(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, playing ? "Jeda" : "Putar", action(A_PLAYPAUSE, 2))
                .addAction(android.R.drawable.ic_media_next, "Berikutnya", action(A_NEXT, 3))
                .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1, 2));
        Notification n = b.build();

        if (playing || !fg) {
            if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            else startForeground(NOTIF_ID, n);
            fg = true;
        }
        if (!playing) {
            // Jeda: lepas status foreground supaya notifikasi bisa digeser, layanan tetap hidup.
            if (Build.VERSION.SDK_INT >= 24) stopForeground(Service.STOP_FOREGROUND_DETACH);
            else stopForeground(false);
            fg = false;
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(NOTIF_ID, n);
        }
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        running = false;
        if (session != null) { session.setActive(false); session.release(); }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
