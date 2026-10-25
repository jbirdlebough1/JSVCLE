#!/usr/bin/env python3
import os

cle_tools_dir = r'D:\CLEJS\Dev\cle_tools'

files = [
    'cle_gamepad.js',
    'cle_fluidnc.js',
    'cle_rotary.js',
    'cle_calibration.js',
    'cle_vault.js',
    'cle_test.js',
    'cle_recovery.js',
    'cle_slicer.js',
    'cle_boot.js'
]

combined_code = ["/* CLEJS Unified Bundle (Non-ES Module for direct file:// Chrome compatibility) */\n(function(){\n'use strict';\n"]

for fname in files:
    fpath = os.path.join(cle_tools_dir, fname)
    with open(fpath, 'r', encoding='utf-8') as f:
        content = f.read()
    # Strip imports and exports
    lines = []
    for line in content.splitlines():
        if line.strip().startswith('import '):
            continue
        if line.strip().startswith('export class '):
            line = line.replace('export class ', 'class ')
        elif line.strip().startswith('export const '):
            line = line.replace('export const ', 'const ')
        elif line.strip().startswith('export function '):
            line = line.replace('export function ', 'function ')
        elif line.strip().startswith('export {'):
            continue
        lines.append(line)
    combined_code.append(f"/* --- Module: {fname} --- */\n" + "\n".join(lines) + "\n")

combined_code.append("\n})();\n")

bundle_path = os.path.join(cle_tools_dir, 'cle_bundle.js')
with open(bundle_path, 'w', encoding='utf-8') as f:
    f.write("\n".join(combined_code))

print(f"Created bundle: {bundle_path} ({os.path.getsize(bundle_path)} bytes)")

