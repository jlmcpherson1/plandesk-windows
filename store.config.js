// Microsoft Store build (MSIX/.appx). Same app as the direct download, minus the self-updater and the
// NSIS file registration: the Store installs, signs and updates it, and the package declares PDF/FDF opening.
// Identity values come from Partner Center (Product management > Product identity) via the workflow inputs.
const base = require("./package.json").build;
const env = process.env;
module.exports = {
  ...base,
  publish: null,
  win: { ...base.win, target: [{ target: "appx", arch: ["x64"] }], artifactName: "PlanDesk-Store-${version}.${ext}" },
  fileAssociations: [
    { ext: "pdf", name: "PDF document", description: "PDF document", icon: "build/pdf.ico" },
    { ext: "fdf", name: "Markup file", description: "Markup file (FDF)", icon: "build/fdf.ico" },
    { ext: "dxf", name: "AutoCAD drawing", description: "AutoCAD drawing (DXF)", icon: "build/dxf.ico" },
    { ext: ["jpg", "jpeg", "png", "tif", "tiff", "heic", "gif", "bmp", "webp"], name: "Picture", description: "Picture", icon: "build/pdf.ico" },
  ],
  // Voice notes on markups need the microphone; the stock template only declares runFullTrust.
  appxManifestCreated: file => { const fs = require("fs"); const x = fs.readFileSync(file, "utf8"); if (!x.includes('Name="microphone"')) fs.writeFileSync(file, x.replace('<rescap:Capability Name="runFullTrust"/>', '<rescap:Capability Name="runFullTrust"/>\n    <DeviceCapability Name="microphone"/>')); },
  appx: {
    applicationId: "PlanDesk",
    identityName: env.STORE_IDENTITY_NAME || "HighlineProperties.PlanDesk",
    publisher: env.STORE_PUBLISHER || "CN=00000000-0000-0000-0000-000000000000",
    publisherDisplayName: env.STORE_PUBLISHER_NAME || "Highline Properties LLC",
    displayName: env.STORE_DISPLAY_NAME || "PlanDesk: Markup &amp; Takeoff", // the name reserved in Partner Center; &amp; because electron-builder puts it into the XML manifest unescaped
    backgroundColor: "#13171b",
    showNameOnTiles: true,
    languages: ["en-US"],
    addAutoLaunchExtension: false,
    minVersion: "10.0.17763.0",
    maxVersionTested: "10.0.26100.0",
  },
};
