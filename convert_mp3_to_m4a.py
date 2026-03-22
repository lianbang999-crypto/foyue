#!/usr/bin/env python3
"""
批量转换 MP3 文件到 M4A 格式
直接使用 ffmpeg 命令行工具
"""

import os
import sys
from pathlib import Path
import subprocess
import time

def get_ffmpeg_path():
    """获取 ffmpeg 可执行文件路径"""
    # 优先使用系统安装的 ffmpeg
    system_ffmpeg = "/Users/bincai/bin/ffmpeg"
    if os.path.exists(system_ffmpeg):
        return system_ffmpeg
    
    # 尝试 imageio-ffmpeg
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except:
        return "ffmpeg"

def convert_mp3_to_m4a(mp3_path, m4a_path, ffmpeg_path):
    """转换单个 MP3 文件到 M4A"""
    try:
        # 使用 ffmpeg 命令行转换
        cmd = [
            ffmpeg_path,
            '-i', mp3_path,
            '-c:a', 'aac',
            '-b:a', '96k',
            '-y',  # 覆盖已存在的文件
            m4a_path
        ]
        
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=300  # 5分钟超时
        )
        
        if result.returncode == 0:
            return True, None
        else:
            error_msg = result.stderr.decode('utf-8', errors='ignore')[-200:]
            return False, error_msg
            
    except subprocess.TimeoutExpired:
        return False, "转换超时"
    except Exception as e:
        return False, str(e)

def batch_convert(source_dir):
    """批量转换目录中的所有 MP3 文件"""
    source_path = Path(source_dir)
    
    if not source_path.exists():
        print(f"错误：源目录不存在: {source_dir}")
        return
    
    # 获取 ffmpeg 路径
    ffmpeg_path = get_ffmpeg_path()
    print(f"使用 ffmpeg: {ffmpeg_path}")
    
    # 查找所有 MP3 文件
    mp3_files = list(source_path.rglob("*.mp3"))
    total_files = len(mp3_files)
    
    if total_files == 0:
        print("未找到任何 MP3 文件")
        return
    
    print(f"找到 {total_files} 个 MP3 文件")
    print("=" * 60)
    
    # 统计信息
    success_count = 0
    fail_count = 0
    skip_count = 0
    failed_files = []
    
    start_time = time.time()
    
    for i, mp3_file in enumerate(mp3_files, 1):
        # 构建输出文件路径（同名但扩展名为 .m4a）
        m4a_file = mp3_file.with_suffix('.m4a')
        
        # 如果 M4A 文件已存在，跳过
        if m4a_file.exists():
            skip_count += 1
            print(f"[{i}/{total_files}] 跳过（已存在）: {mp3_file.name}")
            continue
        
        # 转换文件
        print(f"[{i}/{total_files}] 转换中: {mp3_file.name}", end=" ... ", flush=True)
        success, error = convert_mp3_to_m4a(str(mp3_file), str(m4a_file), ffmpeg_path)
        
        if success:
            success_count += 1
            print("✓ 成功")
        else:
            fail_count += 1
            failed_files.append((mp3_file.name, error))
            print(f"✗ 失败")
    
    # 计算耗时
    elapsed_time = time.time() - start_time
    
    # 输出统计信息
    print("=" * 60)
    print(f"转换完成！")
    print(f"  成功: {success_count} 个")
    print(f"  跳过: {skip_count} 个")
    print(f"  失败: {fail_count} 个")
    print(f"  耗时: {elapsed_time:.2f} 秒")
    
    if failed_files:
        print("\n失败的文件:")
        for filename, error in failed_files[:10]:  # 只显示前10个
            print(f"  - {filename}")
        if len(failed_files) > 10:
            print(f"  ... 还有 {len(failed_files) - 10} 个失败文件")

if __name__ == "__main__":
    # 默认源目录
    default_dir = os.path.expanduser("~/Downloads/m4a")
    
    # 使用命令行参数或默认目录
    source_dir = sys.argv[1] if len(sys.argv) > 1 else default_dir
    
    print(f"源目录: {source_dir}")
    batch_convert(source_dir)
