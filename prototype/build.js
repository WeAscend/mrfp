const fs = require("fs");
const logo = fs.readFileSync(__dirname + "/logo_b64.txt", "utf8").trim();
let html = fs.readFileSync(__dirname + "/page.html", "utf8");
const strip = s => s.replace(/if \(typeof module[^\n]*\n/g, "");
html = html.replace("__RULES__", strip(fs.readFileSync(__dirname + "/rules.js", "utf8")))
           .replace("__DATA__", strip(fs.readFileSync(__dirname + "/data.js", "utf8")))
           .replace("__LOGO__", "data:image/png;base64," + logo);
fs.writeFileSync(__dirname + "/mrfp-prototype.html", html);
console.log("built", (html.length / 1024).toFixed(0), "KB");
