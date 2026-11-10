const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const androidRoot = path.join(root, 'android', 'app', 'src', 'main', 'res');

if (!fs.existsSync(androidRoot)) {
  console.error('Android platform is not generated yet. Run npm run android:add first.');
  process.exit(1);
}

const resources = {
  'drawable/playverse_icon_background.xml': `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="#080B16" />
</shape>
`,
  'drawable/playverse_icon_foreground.xml': `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp"
    android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="#48D9EF"
        android:pathData="M16,66 L21,42 C23,33 30,27 39,27 H69 C78,27 85,33 87,42 L92,66 C93,72 86,76 82,72 L72,62 H36 L26,72 C22,76 15,72 16,66 Z" />
    <path android:fillColor="#071326"
        android:pathData="M31,42 H48 V48 H43 V54 H37 V48 H31 Z" />
    <path android:fillColor="#071326"
        android:pathData="M69,41 A3.5,3.5 0,1 0,69,48 A3.5,3.5 0,1 0,69,41" />
    <path android:fillColor="#071326"
        android:pathData="M78,49 A3.5,3.5 0,1 0,78,56 A3.5,3.5 0,1 0,78,49" />
    <path android:fillColor="#FFFFFF"
        android:pathData="M49,34 V24 C49,21 51,19 54,19 H67 C77,19 83,25 83,33 C83,42 77,47 67,47 H57 V56 H49 V34 Z M57,27 V39 H67 C72,39 75,37 75,33 C75,29 72,27 67,27 Z" />
</vector>
`,
  'mipmap-anydpi-v26/ic_launcher.xml': `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/playverse_icon_background" />
    <foreground android:drawable="@drawable/playverse_icon_foreground" />
</adaptive-icon>
`,
  'mipmap-anydpi-v26/ic_launcher_round.xml': `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/playverse_icon_background" />
    <foreground android:drawable="@drawable/playverse_icon_foreground" />
</adaptive-icon>
`
};

for (const [relativePath, content] of Object.entries(resources)) {
  const destination = path.join(androidRoot, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, content);
}
console.log('PLAYVERSE adaptive Android launcher icons generated.');
