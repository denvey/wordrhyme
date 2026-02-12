#!/usr/bin/env python3
"""
分析特定文件的所有 Timeline 版本
"""

import json
import os
from datetime import datetime
from pathlib import Path

# Antigravity Timeline 历史记录目录
HISTORY_DIR = Path.home() / "Library/Application Support/Antigravity/User/History"

# 事故发生时间
INCIDENT_TIME = datetime(2026, 2, 11, 17, 30, 0)
INCIDENT_TIMESTAMP = int(INCIDENT_TIME.timestamp() * 1000)

# 要分析的文件
TARGET_FILES = [
    "apps/server/src/auth/index.ts",
    "apps/server/src/app.module.ts",
    "apps/server/package.json",
    "package.json",
    ".claude/settings.local.json"
]


def format_timestamp(ts_ms: int) -> str:
    """将毫秒时间戳格式化为可读字符串"""
    dt = datetime.fromtimestamp(ts_ms / 1000)
    return dt.strftime('%Y-%m-%d %H:%M:%S')


def analyze_file_timeline(file_path: str):
    """分析特定文件的所有 Timeline 版本"""
    print(f"\n{'='*100}")
    print(f"📄 文件: {file_path}")
    print(f"{'='*100}")

    found = False

    # 遍历所有子目录
    for subdir in HISTORY_DIR.iterdir():
        if not subdir.is_dir():
            continue

        entries_path = subdir / "entries.json"
        if not entries_path.exists():
            continue

        try:
            with open(entries_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                resource = data.get('resource', '')

                # 检查是否是目标文件
                if file_path not in resource:
                    continue

                found = True
                entries = data.get('entries', [])

                print(f"\n📂 Timeline 目录: {subdir.name}")
                print(f"🔗 资源路径: {resource}")
                print(f"📊 版本数量: {len(entries)}")
                print()

                # 按时间戳排序
                sorted_entries = sorted(entries, key=lambda e: e.get('timestamp', 0))

                print(f"{'序号':<6} {'时间':<20} {'相对事故时间':<30} {'文件ID':<40} {'行数':<10}")
                print("-" * 110)

                for idx, entry in enumerate(sorted_entries, 1):
                    ts = entry.get('timestamp', 0)
                    entry_id = entry.get('id', '')
                    time_str = format_timestamp(ts)

                    # 计算相对事故时间
                    diff_minutes = (ts - INCIDENT_TIMESTAMP) / 1000 / 60
                    if diff_minutes < 0:
                        relative_time = f"事故前 {abs(diff_minutes):.1f} 分钟"
                    else:
                        relative_time = f"事故后 {diff_minutes:.1f} 分钟"

                    # 读取文件内容获取行数
                    content_file = subdir / entry_id
                    line_count = "N/A"
                    if content_file.exists():
                        try:
                            with open(content_file, 'r', encoding='utf-8') as cf:
                                line_count = str(len(cf.read().splitlines()))
                        except:
                            pass

                    # 标记事故时间前后
                    marker = ""
                    if ts <= INCIDENT_TIMESTAMP:
                        marker = "✅ 事故前"
                    else:
                        marker = "⚠️  事故后"

                    print(f"{idx:<6} {time_str:<20} {relative_time:<30} {entry_id:<40} {line_count:<10} {marker}")

                # 分析恢复策略
                print()
                print("💡 恢复策略分析:")

                # 找到事故前的最后一个版本
                pre_incident = [e for e in sorted_entries if e.get('timestamp', 0) <= INCIDENT_TIMESTAMP]
                post_incident = [e for e in sorted_entries if e.get('timestamp', 0) > INCIDENT_TIMESTAMP]

                if pre_incident:
                    last_pre = pre_incident[-1]
                    last_pre_ts = last_pre.get('timestamp', 0)
                    last_pre_time = format_timestamp(last_pre_ts)
                    last_pre_id = last_pre.get('id', '')

                    # 读取行数
                    content_file = subdir / last_pre_id
                    if content_file.exists():
                        try:
                            with open(content_file, 'r', encoding='utf-8') as cf:
                                line_count = len(cf.read().splitlines())
                            print(f"   ✅ 事故前最后版本: {last_pre_time} ({line_count} 行)")
                        except:
                            print(f"   ✅ 事故前最后版本: {last_pre_time}")
                else:
                    print(f"   ❌ 没有事故前的版本记录")

                if post_incident:
                    first_post = post_incident[0]
                    first_post_ts = first_post.get('timestamp', 0)
                    first_post_time = format_timestamp(first_post_ts)
                    first_post_id = first_post.get('id', '')

                    # 读取行数
                    content_file = subdir / first_post_id
                    if content_file.exists():
                        try:
                            with open(content_file, 'r', encoding='utf-8') as cf:
                                line_count = len(cf.read().splitlines())
                            print(f"   ⚠️  事故后第一版本: {first_post_time} ({line_count} 行)")
                        except:
                            print(f"   ⚠️  事故后第一版本: {first_post_time}")

                # 如果事故前最后版本距离事故时间很远，给出警告
                if pre_incident:
                    last_pre_ts = pre_incident[-1].get('timestamp', 0)
                    time_gap_hours = (INCIDENT_TIMESTAMP - last_pre_ts) / 1000 / 60 / 60
                    if time_gap_hours > 24:
                        print(f"   ⚠️  警告: 事故前最后版本距离事故时间 {time_gap_hours:.1f} 小时")
                        print(f"       这个版本可能不是事故时的实际状态")

        except Exception as e:
            print(f"❌ 解析失败: {e}")

    if not found:
        print(f"❌ 未找到该文件的 Timeline 记录")


def main():
    print(f"⏰ 事故时间: {format_timestamp(INCIDENT_TIMESTAMP)}")

    for file_path in TARGET_FILES:
        analyze_file_timeline(file_path)

    print(f"\n{'='*100}")


if __name__ == "__main__":
    main()
