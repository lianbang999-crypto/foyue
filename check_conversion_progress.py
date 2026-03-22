#!/usr/bin/env python3
"""
监控 MP3 到 M4A 转换进度
"""

import os
from pathlib import Path
import time

def check_progress():
    source_dir = Path(os.path.expanduser("~/Downloads/m4a"))
    
    mp3_files = list(source_dir.rglob("*.mp3"))
    m4a_files = list(source_dir.rglob("*.m4a"))
    
    total = len(mp3_files)
    converted = len(m4a_files)
    remaining = total - converted
    
    progress = (converted / total * 100) if total > 0 else 0
    
    print(f"转换进度: {converted}/{total} ({progress:.1f}%)")
    print(f"已转换: {converted} 个文件")
    print(f"待转换: {remaining} 个文件")
    
    # 估算剩余时间（假设每个文件平均1.5分钟）
    estimated_minutes = remaining * 1.5
    print(f"预计剩余时间: {estimated_minutes:.0f} 分钟 ({estimated_minutes/60:.1f} 小时)")

if __name__ == "__main__":
    check_progress()
