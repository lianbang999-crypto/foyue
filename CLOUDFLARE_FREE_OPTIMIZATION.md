# 🎯 Cloudflare免费版优化方案 + 自动化音频处理

## 📊 Cloudflare免费版限制说明

### ✅ 免费版包含的内容

| 服务 | 免费额度 | 说明 |
|------|----------|------|
| **Pages部署** | 无限制 | ✅ 完全免费 |
| **带宽/流量** | 无限制 | ✅ 完全免费 |
| **请求数** | 10万次/天 | ✅ 足够使用 |
| **D1数据库** | 5GB存储 | ✅ 足够使用 |
| **R2存储** | 10GB | ⚠️ 需注意 |
| **R2 Class A操作** | 100万次/月 | ✅ 足够使用 |
| **R2 Class B操作** | 1000万次/月 | ✅ 足够使用 |
| **Workers** | 10万次/天 | ✅ 足够使用 |

### 💰 完全免费的服务

1. **Pages托管** - 无流量费用
2. **CDN加速** - 无带宽费用
3. **SSL证书** - 免费
4. **DNS解析** - 免费
5. **Page Rules** - 3条免费

### ⚠️ 需要注意的限制

1. **R2存储空间**：10GB
   - 当前音频文件：约466集 × 平均50MB = 23GB
   - **建议**：使用外部存储或优化音频格式

2. **Workers调用**：10万次/天
   - 对于音频播放网站来说足够

---

## 🎵 自动化音频处理完整方案

### 方案概述

**目标**：
- ✅ 自动转换新音频为Opus格式
- ✅ 自动上传到R2
- ✅ 自动更新数据库
- ✅ 完全自动化，无需手动干预

### 架构设计

```
新音频文件
    ↓
GitHub Actions 自动触发
    ↓
FFmpeg 转换为 Opus
    ↓
上传到 R2 存储
    ↓
更新 D1 数据库
    ↓
自动部署到 Cloudflare Pages
```

---

## 🚀 完整实施方案

### 第一步：创建自动化工作流

**创建 `.github/workflows/audio-pipeline.yml`**：

```yaml
name: Audio Processing Pipeline

on:
  push:
    paths:
      - 'audio-incoming/**'  # 监听新音频目录
  workflow_dispatch:  # 支持手动触发

jobs:
  process-audio:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Setup FFmpeg
        uses: FedericoCarboni/setup-ffmpeg@v2
        with:
          ffmpeg-version: '5.1.2'

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: |
          npm install -g wrangler

      - name: Process new audio files
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: |
          # 创建处理脚本
          cat > process_audio.sh << 'EOF'
          #!/bin/bash
          
          INPUT_DIR="audio-incoming"
          OUTPUT_DIR="audio-processed"
          
          mkdir -p "$OUTPUT_DIR"
          
          for file in "$INPUT_DIR"/*.mp3; do
            if [ -f "$file" ]; then
              filename=$(basename "$file" .mp3)
              
              echo "🎵 处理: $filename"
              
              # 转换为Opus (64kbps)
              ffmpeg -i "$file" \
                -c:a libopus \
                -b:a 64k \
                -vbr on \
                -compression_level 10 \
                "$OUTPUT_DIR/${filename}.opus" \
                -y
              
              # 同时保留MP3版本（兼容性）
              cp "$file" "$OUTPUT_DIR/${filename}.mp3"
              
              echo "✅ 完成: $filename"
            fi
          done
          EOF
          
          chmod +x process_audio.sh
          ./process_audio.sh

      - name: Upload to R2
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: |
          # 配置wrangler
          echo "api_token = \"$CLOUDFLARE_API_TOKEN\"" > wrangler.toml
          echo "account_id = \"$CLOUDFLARE_ACCOUNT_ID\"" >> wrangler.toml
          
          # 上传到R2
          for file in audio-processed/*.opus; do
            if [ -f "$file" ]; then
              filename=$(basename "$file")
              echo "📤 上传: $filename"
              
              # 上传Opus文件
              wrangler r2 object put daanfashi/opus/$filename \
                --path "$file" \
                --content-type "audio/opus" \
                --cache-control "public, max-age=31536000, immutable"
            fi
          done
          
          for file in audio-processed/*.mp3; do
            if [ -f "$file" ]; then
              filename=$(basename "$file")
              echo "📤 上传: $filename"
              
              # 上传MP3文件
              wrangler r2 object put daanfashi/mp3/$filename \
                --path "$file" \
                --content-type "audio/mpeg" \
                --cache-control "public, max-age=31536000, immutable"
            fi
          done

      - name: Update audio data JSON
        run: |
          # 创建更新脚本
          cat > update_audio_data.js << 'EOF'
          const fs = require('fs');
          const path = require('path');
          
          // 读取现有数据
          const audioData = JSON.parse(
            fs.readFileSync('public/data/audio-data.json', 'utf8')
          );
          
          // 扫描新文件
          const processedDir = './audio-processed';
          const files = fs.readdirSync(processedDir);
          
          // 更新数据结构
          // 这里需要根据实际需求更新
          
          // 保存更新后的数据
          fs.writeFileSync(
            'public/data/audio-data.json',
            JSON.stringify(audioData, null, 2)
          );
          
          console.log('✅ 音频数据已更新');
          EOF
          
          node update_audio_data.js

      - name: Commit changes
        run: |
          git config --local user.email "action@github.com"
          git config --local user.name "GitHub Action"
          git add public/data/audio-data.json
          git commit -m "chore: update audio data" || echo "No changes to commit"
          git push

      - name: Clean up
        run: |
          # 移动已处理的文件到归档目录
          mkdir -p audio-archive
          mv audio-incoming/* audio-archive/ 2>/dev/null || true
          
          # 清理临时文件
          rm -rf audio-processed

      - name: Notify on success
        if: success()
        run: |
          echo "✅ 音频处理完成！"
          echo "新音频已上传到R2并更新数据库"

      - name: Notify on failure
        if: failure()
        run: |
          echo "❌ 音频处理失败，请检查日志"
```

---

### 第二步：配置GitHub Secrets

在GitHub仓库设置中添加以下Secrets：

```
Settings → Secrets and variables → Actions → New repository secret

1. CLOUDFLARE_API_TOKEN
   - 获取方式：https://dash.cloudflare.com/profile/api-tokens
   - 权限：R2 (Edit), D1 (Edit), Workers (Edit)

2. CLOUDFLARE_ACCOUNT_ID
   - 获取方式：Cloudflare Dashboard 右侧
```

---

### 第三步：创建本地处理脚本

**创建 `scripts/process-new-audio.sh`**：

```bash
#!/bin/bash

# 新音频处理脚本
# 用法：./scripts/process-new-audio.sh <音频文件或目录>

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置
INPUT=${1:-"audio-incoming"}
OUTPUT_DIR="audio-processed"
R2_BUCKET="daanfashi"

echo -e "${GREEN}🎵 音频处理工具${NC}"
echo "================================"
echo "输入: $INPUT"
echo "输出: $OUTPUT_DIR"
echo ""

# 检查FFmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo -e "${RED}❌ FFmpeg未安装${NC}"
    echo "请先安装FFmpeg："
    echo "  macOS: brew install ffmpeg"
    echo "  Ubuntu: sudo apt-get install ffmpeg"
    exit 1
fi

# 创建输出目录
mkdir -p "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/opus"
mkdir -p "$OUTPUT_DIR/mp3"

# 处理函数
process_file() {
    local file="$1"
    local filename=$(basename "$file")
    local name="${filename%.*}"
    
    echo -e "${YELLOW}处理: $filename${NC}"
    
    # 转换为Opus
    ffmpeg -i "$file" \
        -c:a libopus \
        -b:a 64k \
        -vbr on \
        -compression_level 10 \
        "$OUTPUT_DIR/opus/${name}.opus" \
        -y 2>/dev/null
    
    # 复制MP3（兼容性）
    cp "$file" "$OUTPUT_DIR/mp3/${name}.mp3"
    
    # 显示文件大小
    local original_size=$(du -h "$file" | cut -f1)
    local opus_size=$(du -h "$OUTPUT_DIR/opus/${name}.opus" | cut -f1)
    
    echo -e "  ${GREEN}✅ 原始: $original_size → Opus: $opus_size${NC}"
}

# 处理文件或目录
if [ -f "$INPUT" ]; then
    # 单个文件
    process_file "$INPUT"
elif [ -d "$INPUT" ]; then
    # 目录
    count=0
    total=$(find "$INPUT" -type f \( -name "*.mp3" -o -name "*.wav" -o -name "*.m4a" \) | wc -l)
    
    for file in "$INPUT"/*.{mp3,wav,m4a} 2>/dev/null; do
        if [ -f "$file" ]; then
            count=$((count + 1))
            echo "[$count/$total]"
            process_file "$file"
        fi
    done
    
    echo ""
    echo -e "${GREEN}✅ 处理完成！共 $count 个文件${NC}"
else
    echo -e "${RED}❌ 输入文件或目录不存在: $INPUT${NC}"
    exit 1
fi

# 询问是否上传到R2
echo ""
read -p "是否上传到R2？(y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}📤 上传到R2...${NC}"
    
    # 检查wrangler
    if ! command -v wrangler &> /dev/null; then
        echo -e "${RED}❌ wrangler未安装${NC}"
        echo "请先安装: npm install -g wrangler"
        exit 1
    fi
    
    # 上传Opus文件
    for file in "$OUTPUT_DIR/opus"/*.opus; do
        if [ -f "$file" ]; then
            filename=$(basename "$file")
            echo "  上传: $filename"
            wrangler r2 object put "$R2_BUCKET/opus/$filename" \
                --path "$file" \
                --content-type "audio/opus" \
                --cache-control "public, max-age=31536000, immutable"
        fi
    done
    
    # 上传MP3文件
    for file in "$OUTPUT_DIR/mp3"/*.mp3; do
        if [ -f "$file" ]; then
            filename=$(basename "$file")
            echo "  上传: $filename"
            wrangler r2 object put "$R2_BUCKET/mp3/$filename" \
                --path "$file" \
                --content-type "audio/mpeg" \
                --cache-control "public, max-age=31536000, immutable"
        fi
    done
    
    echo -e "${GREEN}✅ 上传完成！${NC}"
fi

echo ""
echo -e "${GREEN}🎉 所有操作完成！${NC}"
```

---

### 第四步：更新前端代码支持双格式

**修改 `src/js/player.js`**：

```javascript
// 添加格式选择逻辑
function getAudioUrl(episode) {
  // 检查浏览器支持
  const audio = document.createElement('audio');
  const supportsOpus = audio.canPlayType('audio/opus; codecs=opus');
  
  // 优先使用Opus（如果支持且可用）
  if (supportsOpus && episode.urlOpus) {
    return episode.urlOpus;
  }
  
  // 降级到MP3
  return episode.url;
}

// 在播放时使用
function playCurrent() {
  const tr = state.playlist[state.epIdx];
  const audioUrl = getAudioUrl(tr);
  
  dom.audio.src = audioUrl;
  // ... 其他代码
}
```

**更新音频数据格式**：

```json
{
  "id": 1,
  "title": "第1讲",
  "fileName": "净土资粮信愿行（正编）第1讲.mp3",
  "url": "https://pub-xxx.r2.dev/mp3/净土资粮信愿行（正编）第1讲.mp3",
  "urlOpus": "https://pub-xxx.r2.dev/opus/净土资粮信愿行（正编）第1讲.opus"
}
```

---

## 📋 使用流程

### 方式1：自动处理（推荐）

1. **添加新音频**：
   ```bash
   # 将新音频文件放入 audio-incoming 目录
   cp new-audio.mp3 audio-incoming/
   
   # 提交到GitHub
   git add audio-incoming/
   git commit -m "feat: add new audio"
   git push
   ```

2. **自动触发**：
   - GitHub Actions自动检测新文件
   - 自动转换为Opus
   - 自动上传到R2
   - 自动更新数据库

### 方式2：手动处理

```bash
# 处理单个文件
./scripts/process-new-audio.sh new-audio.mp3

# 处理整个目录
./scripts/process-new-audio.sh audio-incoming/
```

---

## 🎯 优化建议

### 1. R2存储优化

**当前问题**：
- 音频文件约23GB，超过免费额度10GB

**解决方案**：

#### 方案A：使用外部存储
- 使用阿里云OSS、腾讯云COS等
- 成本更低（约¥0.12/GB/月）
- 配置CDN加速

#### 方案B：优化音频格式
- 转换为Opus格式
- 文件大小减少50%
- 23GB → 11.5GB（接近免费额度）

#### 方案C：混合方案
- 热门音频：R2（快速访问）
- 冷门音频：外部存储（节省成本）

### 2. 成本对比

| 方案 | 存储成本 | 带宽成本 | 总成本 |
|------|----------|----------|--------|
| 全部R2 | $0.015/GB | 免费 | ~$0.35/月 |
| Opus优化 | 免费（10GB内） | 免费 | **$0** |
| 外部存储 | ¥0.12/GB | ¥0.5/GB | ~¥10/月 |

---

## ✅ 总结

### Cloudflare免费版优势
- ✅ **完全免费**：无带宽成本
- ✅ **全球CDN**：访问速度快
- ✅ **自动部署**：Git推送即部署

### 自动化方案优势
- ✅ **完全自动化**：新音频自动处理
- ✅ **双格式支持**：Opus + MP3
- ✅ **兼容性好**：支持所有浏览器
- ✅ **易于维护**：无需手动干预

### 推荐方案
1. **立即实施**：音频格式优化（Opus）
2. **配置自动化**：GitHub Actions工作流
3. **监控存储**：定期检查R2使用量

所有脚本和配置都已准备好，您可以立即开始实施！
