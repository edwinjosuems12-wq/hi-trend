const fs = require("fs");
const path = require("path");

const standaloneDir = path.join(__dirname, "../.next/standalone");
const nestedDir = path.join(standaloneDir, "starter/web");

if (fs.existsSync(nestedDir)) {
  console.log("Preparing standalone layout for Firebase App Hosting / Cloud Run...");
  const files = fs.readdirSync(nestedDir);
  for (const file of files) {
    const src = path.join(nestedDir, file);
    const dest = path.join(standaloneDir, file);
    if (!fs.existsSync(dest)) {
      fs.cpSync(src, dest, { recursive: true });
      console.log(`Copied ${file} to standalone root`);
    }
  }
}
