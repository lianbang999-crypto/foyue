const { MCPManagementCenter } = require('./mcp-management-center.js');

(async () => {
  const center = new MCPManagementCenter();
  
  console.log('为foyue项目添加代码学习MCP...\n');
  
  // 添加GitHub MCP用于学习代码
  await center.projectManager.addMCP('foyue', 'github', {}, 'required');
  
  // 添加思考增强MCP
  await center.projectManager.addMCP('foyue', 'sequential-thinking', {}, 'required');
  
  // 添加记忆管理MCP
  await center.projectManager.addMCP('foyue', 'memory', {}, 'required');
  
  // 添加搜索MCP
  await center.projectManager.addMCP('foyue', 'brave-search', {}, 'optional');
  
  // 添加浏览器自动化MCP
  await center.projectManager.addMCP('foyue', 'playwright', {}, 'development');
  
  console.log('\n✓ 已为foyue项目添加所有代码学习相关的MCP！');
  
  // 显示更新后的配置
  const requirements = await center.projectManager.getRequirements('foyue');
  console.log('\n=== foyue项目MCP配置 ===');
  console.log('必需MCP:');
  requirements.mcp.required.forEach(m => console.log(`  - ${m.name}`));
  console.log('\n可选MCP:');
  requirements.mcp.optional.forEach(m => console.log(`  - ${m.name}`));
  console.log('\n开发环境MCP:');
  requirements.mcp.development.forEach(m => console.log(`  - ${m.name}`));
})();
