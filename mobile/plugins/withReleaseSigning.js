const { withAppBuildGradle } = require("expo/config-plugins");

const marker = "OPENCASH_UPLOAD_STORE_FILE";

const releaseBlock = `        release {
            storeFile file(findProperty('OPENCASH_UPLOAD_STORE_FILE') ?: 'missing-release-keystore')
            storePassword findProperty('OPENCASH_UPLOAD_STORE_PASSWORD')
            keyAlias findProperty('OPENCASH_UPLOAD_KEY_ALIAS')
            keyPassword findProperty('OPENCASH_UPLOAD_KEY_PASSWORD')
        }
`;

function patch(gradle) {
  if (gradle.includes(marker)) return gradle;
  const debugEnd = "            keyPassword 'android'\n        }\n";
  if (!gradle.includes(debugEnd)) throw new Error("withReleaseSigning: debug signing block not found");
  let next = gradle.replace(debugEnd, debugEnd + releaseBlock);
  const releaseType = /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;
  if (!releaseType.test(next)) throw new Error("withReleaseSigning: release build type not found");
  next = next.replace(releaseType, "$1signingConfig signingConfigs.release");
  return next;
}

const withReleaseSigning = (config) =>
  withAppBuildGradle(config, (mod) => {
    mod.modResults.contents = patch(mod.modResults.contents);
    return mod;
  });

module.exports = withReleaseSigning;
module.exports.patch = patch;
