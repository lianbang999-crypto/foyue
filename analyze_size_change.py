#!/usr/bin/env python3
"""
分析 MP3 到 M4A 转换后的文件大小变化
"""

import os
from pathlib import Path

def analyze_size_change():
    source_dir = Path(os.path.expanduser("~/Downloads/m4a"))
    
    # 查找所有 MP3 文件
    mp3_files = list(source_dir.rglob("*.mp3"))
    
    total_mp3_size = 0
    total_m4a_size = 0
    compared_count = 0
    
    size_changes = []
    
    for mp3_file in mp3_files:
        m4a_file = mp3_file.with_suffix('.m4a')
        
        if m4a_file.exists():
            mp3_size = mp3_file.stat().st_size
            m4a_size = m4a_file.stat().st_size
            
            total_mp3_size += mp3_size
            total_m4a_size += m4a_size
            compared_count += 1
            
            # 计算变化百分比
            change_percent = ((m4a_size - mp3_size) / mp3_size) * 100
            size_changes.append({
                'name': mp3_file.name,
                'mp3_size': mp3_size,
                'm4a_size': m4a_size,
                'change_percent': change_percent
            })
    
    if compared_count == 0:
        print("尚未有转换完成的文件可供比较")
        return
    
    # 计算总体变化
    total_change = total_m4a_size - total_mp3_size
    total_change_percent = (total_change / total_mp3_size) * 100
    
    # 平均变化
    avg_change_percent = sum(s['change_percent'] for s in size_changes) / len(size_changes)
    
    # 转换为 MB
    total_mp3_mb = total_mp3_size / (1024 * 1024)
    total_m4a_mb = total_m4a_size / (1024 * 1024)
    total_change_mb = total_change / (1024 * 1024)
    
    print("=" * 60)
    print("MP3 到 M4A 转换大小分析")
    print("=" * 60)
    print(f"已比较文件数: {compared_count} 个")
    print()
    print(f"MP3 总大小: {total_mp3_mb:.2f} MB")
    print(f"M4A 总大小: {total_m4a_mb:.2f} MB")
    print(f"大小变化: {total_change_mb:+.2f} MB ({total_change_percent:+.1f}%)")
    print()
    print(f"平均单个文件变化: {avg_change_percent:+.1f}%")
    print()
    
    # 显示几个示例
    print("示例文件:")
    for i, s in enumerate(size_changes[:5], 1):
        mp3_mb = s['mp3_size'] / (1024 * 1024)
        m4a_mb = s['m4a_size'] / (1024 * 1024)
        print(f"{i}. {s['name'][:30]}...")
        print(f"   MP3: {mp3_mb:.2f} MB → M4A: {m4a_mb:.2f} MB ({s['change_percent']:+.1f}%)")
    
    print()
    print("=" * 60)
    
    # 预估所有文件转换后的情况
    all_mp3_size = sum(f.stat().st_size for f in mp3_files)
    all_mp3_mb = all_mp3_size / (1024 * 1024)
    
    # 使用平均变化率预估
    estimated_m4a_mb = all_mp3_mb * (1 + avg_change_percent / 100)
    estimated_change_mb = estimated_m4a_mb - all_mp3_mb
    
    print("预估全部转换完成后的情况:")
    print(f"MP3 总大小: {all_mp3_mb:.2f} MB ({all_mp3_mb/1024:.2f} GB)")
    print(f"预估 M4A 总大小: {estimated_m4a_mb:.2f} MB ({estimated_m4a_mb/1024:.2f} GB)")
    print(f"预估大小变化: {estimated_change_mb:+.2f} MB ({estimated_change_mb/1024:+.2f} GB)")

if __name__ == "__main__":
    analyze_size_change()
