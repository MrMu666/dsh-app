#!/usr/bin/env python3
"""为 CI 生成的 Tauri Android 工程注入 release 签名配置。

用法: python3 inject-android-signing.py [build.gradle.kts 路径]
默认路径: src-tauri/gen/android/app/build.gradle.kts

注入内容（与官方文档 https://v2.tauri.app/zh-cn/distribute/sign/android/ 一致）：
1. import java.io.FileInputStream（模板已有 java.util.Properties）
2. android 块内 buildTypes 前添加 signingConfigs（读取 gen/android/keystore.properties）
3. release buildType 使用该签名配置
"""

import sys
from pathlib import Path

path = Path(
    sys.argv[1] if len(sys.argv) > 1 else "src-tauri/gen/android/app/build.gradle.kts"
)
text = path.read_text(encoding="utf-8")

# 1. 补充 import
if "import java.io.FileInputStream" not in text:
    text = text.replace(
        "import java.util.Properties",
        "import java.util.Properties\nimport java.io.FileInputStream",
        1,
    )

# 2. buildTypes 前插入 signingConfigs（android 块内 4 空格缩进）
signing_configs = (
    "    signingConfigs {\n"
    '        create("release") {\n'
    '            val keystorePropertiesFile = rootProject.file("keystore.properties")\n'
    "            val keystoreProperties = Properties()\n"
    "            if (keystorePropertiesFile.exists()) {\n"
    "                keystoreProperties.load(FileInputStream(keystorePropertiesFile))\n"
    "            }\n"
    '            keyAlias = keystoreProperties["keyAlias"] as String\n'
    '            keyPassword = keystoreProperties["keyPassword"] as String\n'
    '            storeFile = file(keystoreProperties["storeFile"] as String)\n'
    '            storePassword = keystoreProperties["storePassword"] as String\n'
    "        }\n"
    "    }\n"
)
if "signingConfigs" not in text:
    text = text.replace("    buildTypes {", signing_configs + "    buildTypes {", 1)

# 3. release buildType 使用签名配置
if 'signingConfig = signingConfigs.getByName("release")' not in text:
    text = text.replace(
        '        getByName("release") {',
        '        getByName("release") {\n'
        '            signingConfig = signingConfigs.getByName("release")',
        1,
    )

path.write_text(text, encoding="utf-8")
print(f"signing config injected into {path}")
