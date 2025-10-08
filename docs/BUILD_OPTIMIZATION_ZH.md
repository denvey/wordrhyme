# Cromwell CMS 构建优化方案

## 当前构建分析

### 现有构建架构
基于对 startup.js 和各个包配置的分析，Cromwell CMS 使用了复杂的多层构建系统：

1. **根级构建** (`startup.js`) - 协调整个构建流程
2. **核心库构建** - Common → Backend → Frontend 依次构建
3. **服务构建** - Manager, CLI, Server, Admin 等系统服务
4. **扩展构建** - Themes, Plugins, Toolkits 等扩展模块

### 构建流程问题识别

#### 1. 构建时间问题
- **串行构建**: 核心库必须按顺序构建 (Common → Backend → Frontend)
- **重复构建**: 每次完整构建会重建所有包，即使没有变化
- **依赖检查不够精确**: 仅检查dist目录存在，不检查源码变化
- **大量spawn调用**: 每个包都要启动新进程，开销较大

#### 2. 依赖管理问题
- **重复安装**: yarn install 在多个层级执行
- **版本不一致**: 部分包可能使用不同版本的依赖
- **缺少缓存**: 没有有效利用构建缓存

#### 3. 开发体验问题
- **冷启动慢**: 首次构建需要等待所有包完成
- **增量构建不理想**: 微小变化也会触发完整重建
- **错误信息不够清晰**: 构建失败时难以定位问题

## 🚀 构建优化方案

### 1. 并行构建优化

#### 改进方案 1: 智能并行构建
```javascript
// 改进后的 startup.js
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const pLimit = require('p-limit');

// 限制并发数，避免资源竞争
const limit = pLimit(Math.min(require('os').cpus().length, 4));

// 定义构建依赖图
const buildGraph = {
  'core-common': { deps: [], parallel: false },
  'core-backend': { deps: ['core-common'], parallel: false },
  'core-frontend': { deps: ['core-common'], parallel: false },
  'manager': { deps: ['core-backend'], parallel: true },
  'cli': { deps: ['core-backend'], parallel: true },
  'utils': { deps: ['core-backend'], parallel: true },
  'server': { deps: ['core-backend'], parallel: true },
  'admin': { deps: ['core-frontend'], parallel: true },
  'themes': { deps: ['core-frontend', 'utils'], parallel: true },
  'plugins': { deps: ['core-backend', 'core-frontend'], parallel: true },
  'toolkits': { deps: ['core-frontend'], parallel: true }
};

// 并行构建函数
async function buildPackages(packages) {
  const tasks = packages.map(pkg => 
    limit(() => buildPackage(pkg))
  );
  return Promise.all(tasks);
}
```

#### 改进方案 2: 增量构建检测
```javascript
const crypto = require('crypto');
const glob = require('glob');

// 计算源码哈希，检测是否需要重建
function getSourceHash(packageDir) {
  const files = glob.sync('src/**/*.{ts,tsx,js,jsx}', { cwd: packageDir });
  const contents = files.map(file => 
    fs.readFileSync(path.join(packageDir, file), 'utf8')
  );
  return crypto.createHash('sha256')
    .update(contents.join(''))
    .digest('hex');
}

// 智能构建检测
function needsRebuild(packageDir) {
  const buildInfoPath = path.join(packageDir, '.build-info.json');
  const currentHash = getSourceHash(packageDir);
  
  if (!fs.existsSync(buildInfoPath)) {
    return true;
  }
  
  const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, 'utf8'));
  return buildInfo.sourceHash !== currentHash;
}
```

### 2. 构建缓存优化

#### 方案 1: 多层缓存策略
```javascript
// 构建缓存配置
const cacheConfig = {
  // 本地缓存
  local: {
    enabled: true,
    dir: '.cromwell-cache',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7天
  },
  // 共享缓存（团队开发）
  shared: {
    enabled: process.env.CROMWELL_SHARED_CACHE === 'true',
    type: 'redis', // 或 's3', 'gcs'
    url: process.env.CROMWELL_CACHE_URL
  },
  // 持续集成缓存
  ci: {
    enabled: process.env.CI === 'true',
    provider: 'github-actions', // 或 'gitlab-ci', 'jenkins'
  }
};

// 缓存管理器
class CacheManager {
  async get(key) {
    // 1. 检查本地缓存
    const localResult = await this.getLocal(key);
    if (localResult) return localResult;
    
    // 2. 检查共享缓存
    if (cacheConfig.shared.enabled) {
      const sharedResult = await this.getShared(key);
      if (sharedResult) {
        // 保存到本地缓存
        await this.setLocal(key, sharedResult);
        return sharedResult;
      }
    }
    
    return null;
  }
  
  async set(key, value) {
    // 同时更新本地和共享缓存
    await Promise.all([
      this.setLocal(key, value),
      cacheConfig.shared.enabled && this.setShared(key, value)
    ].filter(Boolean));
  }
}
```

#### 方案 2: 构建产物缓存
```javascript
// Rollup 缓存插件配置
// system/core/common/rollup.config.js
export default {
  // 启用缓存
  cache: true,
  
  plugins: [
    // 使用缓存插件
    cachePlugin({
      cacheDir: '.rollup-cache',
      include: ['src/**/*'],
    }),
    
    // TypeScript 编译缓存
    typescript({
      cacheDir: '.tsc-cache',
      incremental: true,
    }),
    
    // 依赖解析缓存
    nodeResolve({
      preferBuiltins: false,
      cache: new Map(), // 内存缓存
    })
  ]
}
```

### 3. 依赖管理优化

#### 方案 1: 统一依赖版本
```json
// 根 package.json 添加 resolutions
{
  "resolutions": {
    "typescript": "4.8.4",
    "rollup": "2.56.2",
    "@types/react": "18.0.25",
    "@types/node": "18.11.9",
    "eslint": "8.27.0",
    "prettier": "2.7.1"
  },
  "engines": {
    "node": ">=16.0.0",
    "yarn": ">=1.22.0"
  }
}
```

#### 方案 2: 优化安装流程
```javascript
// 改进的安装检测
function hasValidNodeModules() {
  const criticalPaths = [
    'node_modules/@cromwell/core',
    'node_modules/typescript',
    'node_modules/rollup',
    'system/core/backend/node_modules',
    'system/core/frontend/node_modules'
  ];
  
  return criticalPaths.every(p => 
    fs.existsSync(path.join(projectRootDir, p))
  );
}

// 智能安装
async function smartInstall() {
  if (hasValidNodeModules() && !process.env.FORCE_INSTALL) {
    console.log('Dependencies are up to date, skipping install');
    return;
  }
  
  // 使用 yarn 的缓存和并行特性
  const yarnArgs = [
    '--frozen-lockfile', // 确保锁定版本
    '--prefer-offline',  // 优先使用缓存
    '--silent',          // 减少输出
    '--network-timeout', '300000' // 增加网络超时
  ];
  
  spawnSync(`yarn install ${yarnArgs.join(' ')}`, spawnOpts);
}
```

### 4. 开发体验优化

#### 方案 1: 快速开发模式
```javascript
// 开发模式优化启动脚本
async function devMode() {
  console.log('🚀 Starting Cromwell CMS in development mode...');
  
  // 1. 只构建必需的核心包
  await buildCoreMinimal();
  
  // 2. 并行启动服务，不等待完整构建
  const services = [
    startService('manager'),
    startService('server', { watch: true }),
    startService('admin', { watch: true })
  ];
  
  // 3. 后台构建其他包
  buildRemainingPackages();
  
  await Promise.all(services);
}

// 最小核心构建（仅构建必需文件）
async function buildCoreMinimal() {
  const corePackages = ['common', 'backend'];
  
  for (const pkg of corePackages) {
    if (needsRebuild(`system/core/${pkg}`)) {
      await buildPackage(`system/core/${pkg}`, { 
        mode: 'development',
        minify: false,
        sourceMap: true 
      });
    }
  }
}
```

#### 方案 2: 错误处理和日志优化
```javascript
// 改进的错误处理
class BuildLogger {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }
  
  logBuildStart(packageName) {
    console.log(`\n📦 Building ${packageName}...`);
    console.time(`Build ${packageName}`);
  }
  
  logBuildEnd(packageName, success) {
    console.timeEnd(`Build ${packageName}`);
    if (success) {
      console.log(`✅ ${packageName} built successfully`);
    } else {
      console.log(`❌ ${packageName} build failed`);
    }
  }
  
  logError(packageName, error) {
    this.errors.push({ package: packageName, error });
    console.error(`\n🚨 Error in ${packageName}:`);
    console.error(error.message);
    
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
  }
  
  generateReport() {
    if (this.errors.length === 0) {
      console.log('\n🎉 All packages built successfully!');
      return;
    }
    
    console.log(`\n📊 Build Report:`);
    console.log(`   ✅ Successful: ${this.totalPackages - this.errors.length}`);
    console.log(`   ❌ Failed: ${this.errors.length}`);
    
    if (this.errors.length > 0) {
      console.log('\nFailed packages:');
      this.errors.forEach(({ package: pkg, error }) => {
        console.log(`   - ${pkg}: ${error.message}`);
      });
    }
  }
}
```

### 5. 性能监控优化

#### 构建性能监控
```javascript
// 构建性能分析器
class BuildProfiler {
  constructor() {
    this.startTime = Date.now();
    this.packageTimes = new Map();
    this.memoryUsage = [];
  }
  
  startPackage(packageName) {
    this.packageTimes.set(packageName, {
      start: Date.now(),
      memoryStart: process.memoryUsage()
    });
  }
  
  endPackage(packageName) {
    const info = this.packageTimes.get(packageName);
    if (!info) return;
    
    const duration = Date.now() - info.start;
    const memoryEnd = process.memoryUsage();
    const memoryDelta = memoryEnd.heapUsed - info.memoryStart.heapUsed;
    
    this.packageTimes.set(packageName, {
      ...info,
      duration,
      memoryDelta
    });
  }
  
  generateReport() {
    const totalTime = Date.now() - this.startTime;
    const packages = Array.from(this.packageTimes.entries())
      .sort((a, b) => b[1].duration - a[1].duration);
    
    console.log('\n📈 Build Performance Report:');
    console.log(`Total build time: ${totalTime}ms`);
    console.log('\nPackage build times:');
    
    packages.forEach(([pkg, info]) => {
      const memoryMB = (info.memoryDelta / 1024 / 1024).toFixed(1);
      console.log(`  ${pkg}: ${info.duration}ms (${memoryMB}MB)`);
    });
  }
}
```

## 🗄️ 数据库查询优化方案

### 当前查询性能问题

#### 常见问题识别
1. **N+1 查询问题** - 在获取产品时重复查询分类和属性
2. **缺少适当索引** - 某些查询字段没有建立索引
3. **查询过度** - 获取了不必要的字段和关联数据
4. **缓存策略不够** - 热点数据没有有效缓存

### 优化方案

#### 1. 查询优化
```typescript
// system/core/backend/src/repositories/product.repository.ts

// 优化前的查询（存在N+1问题）
async getProducts_old(params: PagedParams) {
  const products = await this.repository.find({
    skip: params.pageSize * params.pageNumber,
    take: params.pageSize,
  });
  
  // N+1问题：为每个产品查询分类
  for (const product of products) {
    product.categories = await this.categoryRepo.findByProductId(product.id);
  }
  
  return products;
}

// 优化后的查询（使用JOIN预加载）
async getProducts_optimized(params: PagedParams) {
  return this.repository
    .createQueryBuilder('product')
    .leftJoinAndSelect('product.categories', 'category')
    .leftJoinAndSelect('product.images', 'image') 
    .leftJoinAndSelect('product.attributes', 'attribute')
    .select([
      'product.id',
      'product.name', 
      'product.price',
      'product.mainImage',
      'category.id',
      'category.name',
      'attribute.key',
      'attribute.values'
    ])
    .where('product.isEnabled = :enabled', { enabled: true })
    .orderBy(`product.${params.orderBy}`, params.order)
    .skip(params.pageSize * params.pageNumber)
    .take(params.pageSize)
    .getMany();
}
```

#### 2. 索引优化
```sql
-- 为常用查询字段添加索引
-- products 表优化
CREATE INDEX idx_products_enabled ON products (is_enabled);
CREATE INDEX idx_products_price ON products (price);
CREATE INDEX idx_products_created_at ON products (create_date);
CREATE INDEX idx_products_category_price ON products (category_id, price);
CREATE INDEX idx_products_name_search ON products (name) USING gin(to_tsvector('english', name));

-- product_categories 表优化  
CREATE INDEX idx_categories_parent ON product_categories (parent_id);
CREATE INDEX idx_categories_slug ON product_categories (slug);

-- orders 表优化
CREATE INDEX idx_orders_user_date ON orders (user_id, create_date);
CREATE INDEX idx_orders_status ON orders (status);

-- posts 表优化
CREATE INDEX idx_posts_published ON posts (is_enabled, publish_date);
CREATE INDEX idx_posts_author ON posts (author_id);
```

#### 3. 查询缓存策略
```typescript
// 缓存管理器
export class QueryCacheManager {
  private cache = new Map();
  private readonly defaultTTL = 300; // 5分钟
  
  // 缓存配置
  private cacheConfigs = {
    'products:featured': { ttl: 1800 }, // 30分钟
    'categories:tree': { ttl: 3600 },   // 1小时
    'posts:recent': { ttl: 600 },       // 10分钟
    'user:profile': { ttl: 1800 },      // 30分钟
  };
  
  async get<T>(key: string): Promise<T | null> {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() > cached.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.value;
  }
  
  async set<T>(key: string, value: T, customTTL?: number): Promise<void> {
    const config = this.cacheConfigs[key];
    const ttl = customTTL || config?.ttl || this.defaultTTL;
    
    this.cache.set(key, {
      value,
      expiry: Date.now() + (ttl * 1000)
    });
  }
  
  async invalidate(pattern: string): Promise<void> {
    const keys = Array.from(this.cache.keys());
    const regex = new RegExp(pattern);
    
    keys.forEach(key => {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    });
  }
}

// 在Repository中使用缓存
@Injectable()
export class ProductRepository {
  constructor(
    @InjectRepository(Product) private repository: Repository<Product>,
    private cacheManager: QueryCacheManager
  ) {}
  
  async getFeaturedProducts(): Promise<Product[]> {
    const cacheKey = 'products:featured';
    const cached = await this.cacheManager.get<Product[]>(cacheKey);
    
    if (cached) {
      return cached;
    }
    
    const products = await this.repository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.categories', 'category')
      .where('product.isFeatured = :featured', { featured: true })
      .andWhere('product.isEnabled = :enabled', { enabled: true })
      .orderBy('product.views', 'DESC')
      .take(10)
      .getMany();
    
    await this.cacheManager.set(cacheKey, products);
    return products;
  }
}
```

#### 4. 分页优化
```typescript
// 游标分页优化大数据量查询
export class OptimizedPagination {
  async getPaginatedProducts(params: {
    cursor?: string;
    limit: number;
    categoryId?: number;
  }) {
    const queryBuilder = this.repository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.categories', 'category');
    
    // 使用游标而不是offset，避免大偏移量性能问题
    if (params.cursor) {
      queryBuilder.where('product.id > :cursor', { cursor: params.cursor });
    }
    
    if (params.categoryId) {
      queryBuilder.andWhere('category.id = :categoryId', { 
        categoryId: params.categoryId 
      });
    }
    
    const products = await queryBuilder
      .orderBy('product.id', 'ASC')
      .take(params.limit + 1) // 多取一个判断是否有下一页
      .getMany();
    
    const hasNext = products.length > params.limit;
    if (hasNext) {
      products.pop(); // 移除多取的那个
    }
    
    return {
      data: products,
      hasNext,
      nextCursor: hasNext ? products[products.length - 1].id : null
    };
  }
}
```

## 📊 缓存策略优化

### 多层缓存架构

```typescript
// 缓存策略配置
export class CacheStrategy {
  // L1: 内存缓存 (最快，容量小)
  private memoryCache = new Map();
  
  // L2: Redis 缓存 (快，容量中等)
  private redisClient: Redis;
  
  // L3: 数据库查询缓存 (容量大)
  private queryCache: QueryCache;
  
  async get(key: string): Promise<any> {
    // L1: 检查内存缓存
    if (this.memoryCache.has(key)) {
      return this.memoryCache.get(key);
    }
    
    // L2: 检查Redis缓存
    const redisValue = await this.redisClient.get(key);
    if (redisValue) {
      const value = JSON.parse(redisValue);
      // 回填L1缓存
      this.memoryCache.set(key, value);
      return value;
    }
    
    // L3: 查询数据库并缓存结果
    return null; // 由调用方查询数据库
  }
  
  async set(key: string, value: any, options: CacheOptions = {}) {
    const { ttl = 300, level = 'all' } = options;
    
    if (level === 'all' || level === 'memory') {
      this.memoryCache.set(key, value);
    }
    
    if (level === 'all' || level === 'redis') {
      await this.redisClient.setex(key, ttl, JSON.stringify(value));
    }
  }
}

// 应用级缓存配置
export const cacheStrategies = {
  // 静态内容 - 长期缓存
  staticContent: {
    ttl: 86400, // 24小时
    level: 'all'
  },
  
  // 用户会话 - 中等缓存
  userSession: {
    ttl: 1800, // 30分钟  
    level: 'redis'
  },
  
  // API响应 - 短期缓存
  apiResponse: {
    ttl: 300, // 5分钟
    level: 'memory'
  },
  
  // 数据库查询 - 自适应缓存
  dbQuery: {
    ttl: 600, // 10分钟
    level: 'all',
    invalidateOn: ['create', 'update', 'delete']
  }
};
```

这些优化方案将显著提高 Cromwell CMS 的构建速度和运行性能，同时改善开发体验。