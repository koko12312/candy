const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const gradlePath = 'android/app/build.gradle';
if (fs.existsSync(gradlePath)) {
  let content = fs.readFileSync(gradlePath, 'utf8');
  content = content.replace(/versionCode \d+/g, 'versionCode ' + 1003);
  content = content.replace(/versionName "[^"]+"/g, 'versionName "' + pkg.version + '"');
  fs.writeFileSync(gradlePath, content, 'utf8');
  console.log('Configured Android versionCode: 1003, versionName: ' + pkg.version);
}
