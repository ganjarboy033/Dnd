// Dijalankan setelah `npx cap add android`: menyalin kode native Kanade dan menambal AndroidManifest.
import fs from "node:fs";
import path from "node:path";

const cfg = JSON.parse(fs.readFileSync("capacitor.config.json", "utf8"));
const pkg = cfg.appId;
const javaDir = path.join("android/app/src/main/java", ...pkg.split("."));
if (!fs.existsSync("android")) { console.error("Folder android/ belum ada. Jalankan: npx cap add android"); process.exit(1); }
fs.mkdirSync(javaDir, { recursive: true });

for (const f of fs.readdirSync("native").filter((x) => x.endsWith(".java"))) {
  fs.writeFileSync(path.join(javaDir, f), fs.readFileSync(path.join("native", f), "utf8").replace(/^package .*;/m, `package ${pkg};`));
}
fs.writeFileSync(path.join(javaDir, "MainActivity.java"), `package ${pkg};

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KanadePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`);

const mf = "android/app/src/main/AndroidManifest.xml";
let x = fs.readFileSync(mf, "utf8");
if (!x.includes("kanade-patched")) {
  const perms = `    <!-- kanade-patched -->
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />
`;
  const share = `        <intent-filter>
            <action android:name="android.intent.action.SEND" />
            <category android:name="android.intent.category.DEFAULT" />
            <data android:mimeType="text/plain" />
        </intent-filter>
`;
  const svc = `        <service android:name=".KanadeMediaService" android:exported="false" android:foregroundServiceType="mediaPlayback" />
`;
  x = x.replace("</manifest>", perms + "</manifest>").replace("</activity>", share + "    </activity>").replace("</application>", svc + "    </application>");
  fs.writeFileSync(mf, x);
}
console.log("Android native Kanade terpasang di", javaDir);
