// CJS shim: @techstark/opencv-js sets `module.exports` to a Promise that
// resolves to the cv namespace once the WASM runtime is ready. Re-exporting
// that Promise directly gets mangled by ESM namespace interop (its `then`
// ends up called on the namespace object and throws), so we expose it
// through a plain function instead — functions pass through interop intact.
const cvReady = require("@techstark/opencv-js");

module.exports.getOpenCv = function getOpenCv() {
  return Promise.resolve(cvReady);
};
