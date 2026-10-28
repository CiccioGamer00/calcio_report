import { readFile, writeFile, copyFile } from 'node:fs/promises';

// Explicit Xcode resource membership: copying a plist beside the project is not enough.
const root = new URL('../', import.meta.url);
const project = new URL('mobile/ios/App/App.xcodeproj/project.pbxproj', root);
let source = await readFile(project, 'utf8');
const reference = 'CACA00000000000000000001';
const build = 'CACA00000000000000000002';
if (!source.includes(`${reference} /* PrivacyInfo.xcprivacy */`)) {
  const replacements = [
    ['/* Begin PBXBuildFile section */', `/* Begin PBXBuildFile section */\n\t\t${build} /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = ${reference} /* PrivacyInfo.xcprivacy */; };`],
    ['/* Begin PBXFileReference section */', `/* Begin PBXFileReference section */\n\t\t${reference} /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; };`],
    ['\t\t\t\t504EC3131FED79650016851F /* Info.plist */,', `\t\t\t\t504EC3131FED79650016851F /* Info.plist */,\n\t\t\t\t${reference} /* PrivacyInfo.xcprivacy */,`],
    ['\t\t\t\t504EC30F1FED79650016851F /* Assets.xcassets in Resources */,', `\t\t\t\t504EC30F1FED79650016851F /* Assets.xcassets in Resources */,\n\t\t\t\t${build} /* PrivacyInfo.xcprivacy in Resources */,`],
  ];
  for (const [from, to] of replacements) {
    if (source.split(from).length !== 2) throw Error('Unexpected Xcode privacy resource template');
    source = source.replace(from, to);
  }
} else if (source.split(reference).length !== 4 || source.split(build).length !== 3) {
  throw Error('Incomplete or duplicate privacy resource membership');
}
await copyFile(new URL('mobile/native/PrivacyInfo.xcprivacy', root), new URL('mobile/ios/App/App/PrivacyInfo.xcprivacy', root));
await writeFile(project, source);
console.log('App privacy manifest installed as an Xcode resource.');
