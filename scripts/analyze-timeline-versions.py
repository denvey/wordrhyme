#!/usr/bin/env python3
"""
分析 Antigravity Timeline 中每个文件的最近 2 个版本及其时间戳
用于验证恢复脚本的截止时间设置是否合理
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import List, Tuple, Optional

# Antigravity Timeline 历史记录目录
HISTORY_DIR = Path.home() / "Library/Application Support/Antigravity/User/History"

# 事故发生时间（根据文章）
INCIDENT_TIME = datetime(2026, 2, 11, 17, 30, 0)
INCIDENT_TIMESTAMP = int(INCIDENT_TIME.timestamp() * 1000)  # 转为毫秒


def parse_entries_json(entries_path: Path) -> Tuple[str, List[dict]]:
    """解析 entries.json 文件，返回文件路径和历史记录列表"""
    try:
        with open(entries_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            resource = data.get('resource', '')
            entries = data.get('entries', [])
            return resource, entries
    except Exception as e:
        return '', []


def format_timestamp(ts_ms: int) -> str:
    """将毫秒时间戳格式化为可读字符串"""
    dt = datetime.fromtimestamp(ts_ms / 1000)
    return dt.strftime('%Y-%m-%d %H:%M:%S')


def analyze_timeline():
    """分析所有文件的 Timeline 版本"""
    if not HISTORY_DIR.exists():
        print(f"❌ Timeline 目录不存在: {HISTORY_DIR}")
        return

    print(f"📂 扫描目录: {HISTORY_DIR}")
    print(f"⏰ 事故时间: {format_timestamp(INCIDENT_TIMESTAMP)}")
    print(f"=" * 100)
    print()

    # 统计数据
    total_files = 0
    files_with_multiple_versions = 0
    files_with_post_incident_versions = 0
    problematic_files = []

    # 遍历所有子目录
    for subdir in HISTORY_DIR.iterdir():
        if not subdir.is_dir():
            continue

        entries_path = subdir / "entries.json"
        if not entries_path.exists():
            continue

        resource, entries = parse_entries_json(entries_path)
        if not entries:
            continue

        total_files += 1

        # 按时间戳排序（降序，最新的在前）
        sorted_entries = sorted(entries, key=lambda e: e.get('timestamp', 0), reverse=True)

        if len(sorted_entries) >= 2:
            files_with_multiple_versions += 1

            latest = sorted_entries[0]
            second_latest = sorted_entries[1]

            latest_ts = latest.get('timestamp', 0)
            second_ts = second_latest.get('timestamp', 0)

            # 检查是否有问题：最新版本在事故后，次新版本在事故前
            if latest_ts > INCIDENT_TIMESTAMP and second_ts <= INCIDENT_TIMESTAMP:
                files_with_post_incident_versions += 1

                # 提取文件路径（去掉 file:// 前缀）
                file_path = resource.replace('file://', '')

                problematic_files.append({
                    'path': file_path,
                    'latest_ts': latest_ts,
                    'second_ts': second_ts,
                    'time_diff_minutes': (latest_ts - second_ts) / 1000 / 60,
                    'latest_id': latest.get('id', ''),
                    'second_id': second_latest.get('id', ''),
                    'history_dir': subdir
                })

    # 输出统计结果
    print(f"📊 统计结果:")
    print(f"  - 总文件数: {total_files}")
    print(f"  - 有多个版本的文件: {files_with_multiple_versions}")
    print(f"  - 最新版本在事故后的文件: {files_with_post_incident_versions}")
    print()

    if problematic_files:
        print(f"⚠️  发现 {len(problematic_files)} 个潜在问题文件:")
        print(f"   （最新版本在事故后，次新版本在事故前）")
        print()

        for idx, item in enumerate(sorted(problematic_files, key=lambda x: x['time_diff_minutes'], reverse=True), 1):
            file_path = item['path']
            second_time = format_timestamp(item['second_ts'])
            latest_time = format_timestamp(item['latest_ts'])
            time_diff = f"{item['time_diff_minutes']:.1f}"

            print(f"\n{idx}. {file_path}")
            print(f"   次新版本: {second_time} (事故前)")
            print(f"   最新版本: {latest_time} (事故后 {(item['latest_ts'] - INCIDENT_TIMESTAMP) / 1000 / 60:.1f} 分钟)")
            print(f"   时间差: {time_diff} 分钟")

            # 显示版本文件路径
            second_file = item['history_dir'] / item['second_id']
            latest_file = item['history_dir'] / item['latest_id']

            if second_file.exists() and latest_file.exists():
                try:
                    with open(second_file, 'r', encoding='utf-8') as f:
                        second_content = f.read()
                    with open(latest_file, 'r', encoding='utf-8') as f:
                        latest_content = f.read()

                    second_lines = len(second_content.splitlines())
                    latest_lines = len(latest_content.splitlines())

                    print(f"   次新版本: {second_lines} 行")
                    print(f"   最新版本: {latest_lines} 行 ({'增加' if latest_lines > second_lines else '减少'} {abs(latest_lines - second_lines)} 行)")

                    # 如果是小文件，显示差异摘要
                    if second_lines < 100 and latest_lines < 100:
                        if second_content != latest_content:
                            print(f"   ⚠️  内容有差异")
                        else:
                            print(f"   ✅ 内容相同")
                except Exception as e:
                    print(f"   ❌ 无法读取文件内容: {e}")

        print()
        print(f"💡 分析:")
        print(f"   如果恢复脚本使用截止时间 {format_timestamp(INCIDENT_TIMESTAMP)}，")
        print(f"   这些文件会恢复到「次新版本」而非「最新版本」。")
        print(f"   需要检查这些文件的实际内容，判断应该使用哪个版本。")
    else:
        print(f"✅ 未发现问题文件")
        print(f"   所有文件的最新版本都在事故时间之前，或者只有一个版本。")

    print()
    print("=" * 100)


def main():
    analyze_timeline()


if __name__ == "__main__":
    main()
