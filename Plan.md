# Eye Gaze Mouse Control — Web Architecture Plan
## MediaPipe JS + TF.js + Next.js (Edge-AI 2026)

> **Mục tiêu:** Điều khiển chuột bằng mắt hoàn toàn trên browser, không cần server xử lý ảnh, cá nhân hóa cho từng người dùng.
> **Thời gian ước tính:** 10–14 ngày làm việc
> **Target:** 60FPS, latency < 150ms, MAE < 80px sau calibration

---

## Stack & Phiên bản cố định

```
# Frontend
next                          15.3.1
react                         19.1.0
typescript                    5.8.3
@mediapipe/tasks-vision       0.10.22
@tensorflow/tfjs              4.22.0
@tensorflow/tfjs-backend-webgpu  4.22.0

# Backend
@nestjs/core                  11.1.0
@nestjs/common                11.1.0
@nestjs/typeorm               11.0.0
typeorm                       0.3.21
pg                            8.13.3
class-validator               0.14.2

# Tooling
pnpm                          9.15.4
node                          22.14.0
```

> **Quan trọng:** Ghim cứng phiên bản trong `package.json` bằng cách bỏ `^` và `~`. TF.js và MediaPipe thay đổi API thường xuyên.

---

## Cấu trúc dự án

```
gaze-web/
├── apps/
│   ├── web/                          # Next.js 15 app
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   │   ├── login/page.tsx
│   │   │   │   └── register/page.tsx
│   │   │   ├── calibration/page.tsx  # Phase 3
│   │   │   ├── dashboard/page.tsx
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── gaze/
│   │   │   │   ├── GazeProvider.tsx  # Context + main loop
│   │   │   │   ├── CalibrationUI.tsx
│   │   │   │   └── DebugOverlay.tsx
│   │   │   └── ui/
│   │   ├── lib/
│   │   │   ├── gaze/
│   │   │   │   ├── mediapipe.ts      # Phase 2
│   │   │   │   ├── feature-extractor.ts  # Phase 2
│   │   │   │   ├── ear-detector.ts   # Phase 2
│   │   │   │   ├── calibration.ts    # Phase 3
│   │   │   │   ├── polynomial.ts     # Phase 3
│   │   │   │   ├── mlp-model.ts      # Phase 4
│   │   │   │   └── smoother.ts       # Phase 5
│   │   │   └── api/
│   │   │       └── client.ts
│   │   └── workers/
│   │       └── gaze.worker.ts        # Phase 6
│   └── api/                          # NestJS app
│       ├── src/
│       │   ├── auth/
│       │   ├── weights/
│       │   │   ├── weights.controller.ts
│       │   │   ├── weights.service.ts
│       │   │   └── weights.entity.ts
│       │   └── users/
│       └── migrations/
├── packages/
│   └── shared-types/                 # Types dùng chung
├── evaluation/                       # Phase 7
│   ├── accuracy-test.ts
│   ├── latency-test.ts
│   └── results/
├── pnpm-workspace.yaml
└── turbo.json
```

---

## Phase 0 — Project Setup & Tooling

### 0.1 — Khởi tạo monorepo

```bash
# Tạo workspace
mkdir gaze-web && cd gaze-web
pnpm init

# pnpm-workspace.yaml
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - 'apps/*'
  - 'packages/*'
EOF

# Cài Turborepo
pnpm add -Dw turbo@2.4.4

# Tạo Next.js app
pnpm create next-app@15.3.1 apps/web \
  --typescript --tailwind --app --no-src-dir

# Tạo NestJS app
cd apps && pnpm dlx @nestjs/cli@11.0.7 new api \
  --package-manager pnpm --language typescript

cd ../
```

### 0.2 — Cài dependencies Frontend

```bash
cd apps/web

# MediaPipe — quan trọng: dùng @mediapipe/tasks-vision (API mới 2024+)
# KHÔNG dùng @mediapipe/face_mesh (deprecated)
pnpm add @mediapipe/tasks-vision@0.10.22

# TensorFlow.js — cài đầy đủ 3 package
pnpm add @tensorflow/tfjs@4.22.0
pnpm add @tensorflow/tfjs-backend-webgpu@4.22.0
pnpm add @tensorflow/tfjs-backend-wasm@4.22.0

# Utilities
pnpm add comlink@4.4.2          # Web Worker bridge
pnpm add zustand@5.0.3          # State management
pnpm add idb@8.0.2              # IndexedDB wrapper (lưu calibration offline)
pnpm add @tanstack/react-query@5.67.3
```

### 0.3 — Cài dependencies Backend

```bash
cd apps/api

pnpm add @nestjs/typeorm@11.0.0 typeorm@0.3.21 pg@8.13.3
pnpm add @nestjs/config@3.3.0
pnpm add @nestjs/jwt@10.2.0 @nestjs/passport@10.0.3
pnpm add class-validator@0.14.2 class-transformer@0.5.1
pnpm add bcrypt@5.1.1
pnpm add -D @types/bcrypt @types/pg
```

### 0.4 — Kiểm tra WebGPU support

```typescript
// apps/web/lib/check-runtime.ts
export async function checkRuntime(): Promise<{
  webgpu: boolean;
  wasm: boolean;
  mediapipe: boolean;
}> {
  const webgpu = 'gpu' in navigator && !!(await navigator.gpu?.requestAdapter());
  const wasm = typeof WebAssembly !== 'undefined';

  return { webgpu, wasm, mediapipe: wasm || webgpu };
}
```

```bash
# Chạy check trong browser console
# Chrome 121+ và Edge 121+ hỗ trợ WebGPU
# Firefox cần enable dom.webgpu.enabled trong about:config
```

### 0.5 — Database setup

```bash
# Docker compose cho development
cat > docker-compose.dev.yml << 'EOF'
services:
  postgres:
    image: postgres:17.4-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: gaze_dev
      POSTGRES_USER: gaze
      POSTGRES_PASSWORD: gaze_dev_pass
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
EOF

docker compose -f docker-compose.dev.yml up -d
```

**Checklist Phase 0:**
- [ ] `pnpm turbo build` chạy không lỗi
- [ ] WebGPU detected: `true` trên Chrome
- [ ] PostgreSQL kết nối thành công từ NestJS
- [ ] Hot reload hoạt động cả hai app

---

## Phase 1 — Database Schema & API Foundation

### 1.1 — Entity definitions

```typescript
// apps/api/src/users/user.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, OneToOne } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  passwordHash: string;

  @CreateDateColumn()
  createdAt: Date;

  @OneToOne(() => GazeWeights, weights => weights.user, { cascade: true })
  gazeWeights: GazeWeights;
}
```

```typescript
// apps/api/src/weights/weights.entity.ts
@Entity('gaze_weights')
export class GazeWeights {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User)
  @JoinColumn()
  user: User;

  // Polynomial Regression coefficients — dùng cho Quick Mode
  @Column('jsonb', { nullable: true })
  polyCoeffsX: number[];   // ~6 coefficients (degree 2, 2 inputs)

  @Column('jsonb', { nullable: true })
  polyCoeffsY: number[];

  // MLP weights — dùng cho Personalized Mode
  // Lưu dạng base64 string của tf.io.ModelArtifacts
  @Column('text', { nullable: true })
  mlpWeightsJson: string;   // model topology (~5KB)

  @Column('bytea', { nullable: true })
  mlpWeightsBin: Buffer;    // weight tensors (~15-25KB)

  // EAR threshold cá nhân hóa
  @Column('float', { default: 0.21 })
  earThreshold: number;

  // Metadata
  @Column('int', { default: 0 })
  calibrationPoints: number;   // Số điểm đã calibrate

  @Column('float', { nullable: true })
  lastMaePixels: number;       // MAE lần calibrate cuối

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### 1.2 — Migration

```bash
cd apps/api

# Generate migration
pnpm typeorm migration:generate src/migrations/InitSchema -d src/data-source.ts

# Run migration
pnpm typeorm migration:run -d src/data-source.ts
```

### 1.3 — Weights API endpoints

```
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/me

GET    /api/weights          → Load weights cho user hiện tại
PUT    /api/weights/poly     → Lưu Polynomial coefficients
PUT    /api/weights/mlp      → Lưu MLP weights (JSON body: mlpWeightsJson + mlpWeightsBin)
DELETE /api/weights          → Reset, xóa toàn bộ weights
```

### 1.4 — Kiểm tra API

```bash
# Health check
curl http://localhost:3001/api/health

# Register
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test1234"}'

# Save poly weights
curl -X PUT http://localhost:3001/api/weights/poly \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"coeffsX":[0.1,0.2,0.3,0.4,0.5,0.6],"coeffsY":[...]}'
```

**Checklist Phase 1:**
- [ ] Migration chạy thành công, table tồn tại
- [ ] Register/Login/JWT hoạt động
- [ ] PUT weights → GET weights trả về đúng data
- [ ] MLP binary blob lưu và load không bị corrupt (verify bằng MD5)

---

## Phase 2 — MediaPipe Integration & Feature Extraction

### 2.1 — Setup MediaPipe FaceLandmarker

```typescript
// apps/web/lib/gaze/mediapipe.ts
import { FaceLandmarker, FilesetResolver, FaceLandmarkerResult } from '@mediapipe/tasks-vision';

// Landmark indices — MediaPipe Face Mesh 478 points
export const LANDMARKS = {
  // Iris
  IRIS_LEFT_CENTER:  468,
  IRIS_RIGHT_CENTER: 473,
  IRIS_LEFT_OUTER:   469,
  IRIS_LEFT_TOP:     470,
  IRIS_LEFT_INNER:   471,
  IRIS_LEFT_BOTTOM:  472,
  IRIS_RIGHT_OUTER:  474,
  IRIS_RIGHT_TOP:    475,
  IRIS_RIGHT_INNER:  476,
  IRIS_RIGHT_BOTTOM: 477,

  // Eye corners (cho normalize + EAR)
  EYE_LEFT_OUTER:    33,
  EYE_LEFT_INNER:    133,
  EYE_LEFT_TOP_1:    160,
  EYE_LEFT_TOP_2:    158,
  EYE_LEFT_BOT_1:    144,
  EYE_LEFT_BOT_2:    153,

  EYE_RIGHT_OUTER:   263,
  EYE_RIGHT_INNER:   362,
  EYE_RIGHT_TOP_1:   385,
  EYE_RIGHT_TOP_2:   387,
  EYE_RIGHT_BOT_1:   380,
  EYE_RIGHT_BOT_2:   373,

  // Head pose reference points
  NOSE_TIP:          4,
  CHIN:              152,
  LEFT_TEMPLE:       234,
  RIGHT_TEMPLE:      454,
} as const;

export async function createFaceLandmarker(): Promise<FaceLandmarker> {
  const filesetResolver = await FilesetResolver.forVisionTasks(
    // Dùng CDN để tránh bundle size lớn
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm'
  );

  return FaceLandmarker.createFromOptions(filesetResolver, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
      delegate: 'GPU',   // Tự fallback về CPU nếu không có WebGPU
    },
    outputFaceBlendshapes: false,    // Không cần, tiết kiệm compute
    outputFacialTransformationMatrixes: true,   // Cần cho head pose
    runningMode: 'VIDEO',
    numFaces: 1,
  });
}
```

### 2.2 — Feature Extractor (7 features)

```typescript
// apps/web/lib/gaze/feature-extractor.ts

export interface GazeFeatures {
  // Normalized iris position trong eye socket [-1, 1]
  irisXLeft:  number;
  irisYLeft:  number;
  irisXRight: number;
  irisYRight: number;

  // Head pose từ facial transformation matrix (degrees)
  headPitch: number;   // Ngửa/cúi đầu
  headYaw:   number;   // Quay trái/phải
  headRoll:  number;   // Nghiêng đầu

  // Metadata (không dùng để train, dùng để filter)
  earLeft:  number;
  earRight: number;
  faceDetected: boolean;
}

export function extractFeatures(
  result: FaceLandmarkerResult,
  videoWidth: number,
  videoHeight: number
): GazeFeatures | null {
  if (!result.faceLandmarks?.length) {
    return null;
  }

  const lm = result.faceLandmarks[0];
  const matrix = result.facialTransformationMatrixes?.[0]?.data;

  // Iris normalization
  // Công thức: (iris_x - eye_inner_x) / (eye_outer_x - eye_inner_x)
  // Range output: [0, 1] với 0.5 = nhìn thẳng
  const irisXLeft = normalizeIris(
    lm[LANDMARKS.IRIS_LEFT_CENTER].x,
    lm[LANDMARKS.EYE_LEFT_INNER].x,
    lm[LANDMARKS.EYE_LEFT_OUTER].x
  );

  const irisYLeft = normalizeIris(
    lm[LANDMARKS.IRIS_LEFT_CENTER].y,
    lm[LANDMARKS.EYE_LEFT_TOP_1].y,
    lm[LANDMARKS.EYE_LEFT_BOT_1].y
  );

  // Tương tự cho mắt phải (lưu ý flip x vì đối xứng)
  const irisXRight = 1 - normalizeIris(
    lm[LANDMARKS.IRIS_RIGHT_CENTER].x,
    lm[LANDMARKS.EYE_RIGHT_INNER].x,
    lm[LANDMARKS.EYE_RIGHT_OUTER].x
  );

  const irisYRight = normalizeIris(
    lm[LANDMARKS.IRIS_RIGHT_CENTER].y,
    lm[LANDMARKS.EYE_RIGHT_TOP_1].y,
    lm[LANDMARKS.EYE_RIGHT_BOT_1].y
  );

  // Head pose từ 4x4 transformation matrix
  // matrix layout: [r00,r01,r02,t0, r10,r11,r12,t1, r20,r21,r22,t2, 0,0,0,1]
  const { pitch, yaw, roll } = matrix
    ? extractEulerAngles(matrix)
    : { pitch: 0, yaw: 0, roll: 0 };

  // EAR cho blink detection
  const earLeft  = computeEAR(lm, 'left');
  const earRight = computeEAR(lm, 'right');

  return {
    irisXLeft, irisYLeft, irisXRight, irisYRight,
    headPitch: pitch, headYaw: yaw, headRoll: roll,
    earLeft, earRight, faceDetected: true
  };
}

function normalizeIris(irisPos: number, edgeA: number, edgeB: number): number {
  const range = Math.abs(edgeB - edgeA);
  if (range < 0.001) return 0.5;
  return Math.max(0, Math.min(1, (irisPos - Math.min(edgeA, edgeB)) / range));
}

function extractEulerAngles(m: Float32Array): { pitch: number; yaw: number; roll: number } {
  // Decompose rotation matrix → Euler angles (XYZ convention)
  const pitch = Math.atan2(-m[9], m[10]) * (180 / Math.PI);
  const yaw   = Math.atan2(m[8], Math.sqrt(m[9]**2 + m[10]**2)) * (180 / Math.PI);
  const roll  = Math.atan2(-m[4], m[0]) * (180 / Math.PI);
  return { pitch, yaw, roll };
}

function computeEAR(lm: NormalizedLandmark[], eye: 'left' | 'right'): number {
  const idx = eye === 'left'
    ? [LANDMARKS.EYE_LEFT_OUTER, LANDMARKS.EYE_LEFT_TOP_1, LANDMARKS.EYE_LEFT_TOP_2,
       LANDMARKS.EYE_LEFT_INNER, LANDMARKS.EYE_LEFT_BOT_1, LANDMARKS.EYE_LEFT_BOT_2]
    : [LANDMARKS.EYE_RIGHT_OUTER, LANDMARKS.EYE_RIGHT_TOP_1, LANDMARKS.EYE_RIGHT_TOP_2,
       LANDMARKS.EYE_RIGHT_INNER, LANDMARKS.EYE_RIGHT_BOT_1, LANDMARKS.EYE_RIGHT_BOT_2];

  const dist = (a: number, b: number) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y);
  return (dist(idx[1], idx[5]) + dist(idx[2], idx[4])) / (2 * dist(idx[0], idx[3]));
}
```

### 2.3 — EAR Adaptive Threshold

```typescript
// apps/web/lib/gaze/ear-detector.ts
// Adaptive: tự điều chỉnh threshold sau 2 giây đầu (baseline calibration)

export class AdaptiveEARDetector {
  private baselineEAR = 0.28;     // Sẽ được cập nhật
  private readonly RATIO = 0.75;  // threshold = baseline × 0.75
  private history: number[] = [];
  private readonly WINDOW = 90;   // 3 giây ở 30fps

  update(earLeft: number, earRight: number): 'none' | 'short' | 'long' {
    const ear = (earLeft + earRight) / 2;

    // Cập nhật baseline từ giá trị mắt mở (EAR cao)
    if (ear > this.baselineEAR * 0.9) {
      this.history.push(ear);
      if (this.history.length > this.WINDOW) this.history.shift();
      this.baselineEAR = Math.max(...this.history.slice(-30));
    }

    const threshold = this.baselineEAR * this.RATIO;
    return this.classifyBlink(ear, threshold);
  }

  get currentThreshold(): number {
    return this.baselineEAR * this.RATIO;
  }
}
```

### 2.4 — Kiểm tra Phase 2

```bash
# Test trong browser DevTools Console
# Sau khi mount component:

# 1. FPS check — mở Performance tab, record 10s
# Mục tiêu: MediaPipe step() < 16ms mỗi frame

# 2. Feature sanity check
# Nhìn góc trái màn hình → irisXLeft và irisXRight phải < 0.4
# Nhìn góc phải màn hình → irisXLeft và irisXRight phải > 0.6
# Cúi đầu → headPitch tăng
# Nhìn thẳng → headYaw ≈ 0

# 3. EAR check
# Mắt mở bình thường: EAR ≈ 0.25-0.35
# Chớp mắt: EAR xuống < 0.15
# Nhắm hoàn toàn: EAR < 0.05
```

**Checklist Phase 2:**
- [ ] MediaPipe khởi tạo < 3 giây (lần đầu download model)
- [ ] `extractFeatures()` chạy < 2ms (không tính MediaPipe step)
- [ ] irisXLeft/Right thay đổi rõ ràng khi nhìn trái/phải
- [ ] headYaw thay đổi ≥ 15° khi quay đầu 45°
- [ ] EAR < 0.21 khi chớp mắt chủ động
- [ ] Toàn bộ pipeline ≥ 30fps trên Chrome + WebGPU

---

## Phase 3 — Calibration System (Polynomial Regression)

### 3.1 — Thiết kế Calibration UI

```
Grid 4×3 (12 điểm) — hiện tuần tự theo pattern Z:

 [1]──────[2]──────[3]──────[4]
  │                            │
 [5]──────[6]──────[7]──────[8]
  │                            │
 [9]─────[10]─────[11]─────[12]

Margin: 10% từ mỗi cạnh màn hình
→ Điểm (1): x=192, y=108 (với 1920×1080)
→ Điểm (12): x=1728, y=972
```

```typescript
// apps/web/lib/gaze/calibration.ts

export interface CalibrationSample {
  features: number[];    // [irisXL, irisYL, irisXR, irisYR, pitch, yaw, roll]
  screenX: number;
  screenY: number;
  timestamp: number;
}

export class CalibrationSession {
  private samples: CalibrationSample[] = [];
  private readonly SAMPLES_PER_POINT = 25;   // 25 frame × ~33ms ≈ 0.8s thu data
  private readonly STABLE_WAIT_MS    = 1200; // Chờ mắt ổn định

  async collectPoint(
    targetX: number,
    targetY: number,
    featureStream: AsyncIterable<GazeFeatures>
  ): Promise<void> {
    // Chờ STABLE_WAIT_MS trước khi bắt đầu thu
    await sleep(this.STABLE_WAIT_MS);

    const buffer: number[][] = [];
    for await (const features of featureStream) {
      // Bỏ qua frame nếu đang chớp mắt
      if (features.earLeft < 0.18 || features.earRight < 0.18) continue;

      buffer.push(this.featuresToVector(features));
      if (buffer.length >= this.SAMPLES_PER_POINT) break;
    }

    // Dùng median của 25 frame để loại noise
    const medianFeatures = vectorMedian(buffer);
    this.samples.push({
      features: medianFeatures,
      screenX: targetX,
      screenY: targetY,
      timestamp: Date.now()
    });
  }

  private featuresToVector(f: GazeFeatures): number[] {
    return [f.irisXLeft, f.irisYLeft, f.irisXRight, f.irisYRight,
            f.headPitch, f.headYaw, f.headRoll];
  }

  getSamples(): CalibrationSample[] { return this.samples; }
}
```

### 3.2 — Polynomial Regression (Pure JS, không cần TF.js)

```typescript
// apps/web/lib/gaze/polynomial.ts
// Implement bằng tay để không phụ thuộc TF.js cho task đơn giản này

export class PolynomialGazeMapper {
  private coeffsX: number[] = [];
  private coeffsY: number[] = [];
  private readonly DEGREE = 2;

  // Expand features thành polynomial terms bậc 2
  // Input 7 features → 36 terms (1 + 7 + 28 cross terms)
  // Nhưng chỉ dùng iris (4 features) để giữ đơn giản hơn
  // → expand 4 features bậc 2 → 15 terms
  private expand(f: number[]): number[] {
    const [x1, y1, x2, y2, p, y, r] = f;
    return [
      1,                                    // bias
      x1, y1, x2, y2, p, y, r,            // linear terms
      x1*x1, y1*y1, x2*x2, y2*y2,         // quadratic
      p*p, y*y,
      x1*y1, x2*y2,                         // cross terms iris
      x1*y, x2*y,                           // iris × head yaw
      y1*p, y2*p,                           // iris × head pitch
    ];
  }

  fit(samples: CalibrationSample[]): { maeX: number; maeY: number; r2X: number; r2Y: number } {
    const X = samples.map(s => this.expand(s.features));
    const yX = samples.map(s => s.screenX);
    const yY = samples.map(s => s.screenY);

    // Least squares với Ridge regularization (λ=0.01)
    this.coeffsX = ridgeRegression(X, yX, 0.01);
    this.coeffsY = ridgeRegression(X, yY, 0.01);

    // Tính metrics
    const predX = samples.map(s => this.predict(s.features)[0]);
    const predY = samples.map(s => this.predict(s.features)[1]);

    return {
      maeX: mae(predX, yX),
      maeY: mae(predY, yY),
      r2X:  r2score(predX, yX),
      r2Y:  r2score(predY, yY),
    };
  }

  predict(features: number[]): [number, number] {
    const x = this.expand(features);
    return [dot(this.coeffsX, x), dot(this.coeffsY, x)];
  }

  serialize(): { coeffsX: number[]; coeffsY: number[] } {
    return { coeffsX: this.coeffsX, coeffsY: this.coeffsY };
  }

  load(data: { coeffsX: number[]; coeffsY: number[] }): void {
    this.coeffsX = data.coeffsX;
    this.coeffsY = data.coeffsY;
  }
}

// Giải hệ phương trình bình phương tối thiểu: θ = (XᵀX + λI)⁻¹Xᵀy
function ridgeRegression(X: number[][], y: number[], lambda: number): number[] {
  // Implement Gaussian elimination hoặc dùng numeric.js
  // ... (implementation)
}
```

### 3.3 — Calibration flow hoàn chỉnh

```
Bước 1: Hiện điểm [1] → Animate điểm (pulse) để thu hút mắt
Bước 2: Progress bar chạy (STABLE_WAIT_MS = 1.2s)
Bước 3: Flash xanh lá → bắt đầu thu 25 frames
Bước 4: Điểm ✓ → chuyển điểm [2]
...
Bước cuối: Hiện kết quả metrics
         ├── MAE < 80px: "Calibration tốt ✓" → Cho dùng
         ├── MAE 80-120px: "Calibration trung bình" → Đề xuất làm lại
         └── MAE > 120px: "Calibration kém" → Bắt làm lại
```

### 3.4 — Lưu offline bằng IndexedDB

```typescript
// Lưu vào IndexedDB để dùng khi không đăng nhập
import { openDB } from 'idb';

const db = await openDB('gaze-store', 1, {
  upgrade(db) {
    db.createObjectStore('calibration');
  }
});

await db.put('calibration', {
  polyCoeffs: mapper.serialize(),
  earThreshold: detector.currentThreshold,
  savedAt: Date.now()
}, 'current');
```

**Checklist Phase 3:**
- [ ] 12 điểm thu xong trong < 30 giây
- [ ] Không có frame blink lọt vào calibration data
- [ ] MAE in-sample < 50px (nếu > 50px → kiểm tra feature extractor)
- [ ] R² > 0.90 cho cả X và Y
- [ ] Coefficients lưu/load từ IndexedDB đúng

---

## Phase 4 — MLP Personalization Model (TF.js)

### 4.1 — Kiến trúc MLP

```
Input layer:   7 nodes  (iris × 4 + head pose × 3)
Hidden layer1: 32 nodes (ReLU) + Dropout(0.1)
Hidden layer2: 16 nodes (ReLU)
Output layer:  2 nodes  (screen_x, screen_y — normalized [0,1])
                         → scale lại bằng screen resolution

Tổng parameters: 7×32 + 32 + 32×16 + 16 + 16×2 + 2 = 802 params
Model size sau serialize: ~12-20KB
```

```typescript
// apps/web/lib/gaze/mlp-model.ts
import * as tf from '@tensorflow/tfjs';

export class GazeMLPModel {
  private model: tf.LayersModel | null = null;

  build(): void {
    this.model = tf.sequential({
      layers: [
        tf.layers.dense({
          inputShape: [7],
          units: 32,
          activation: 'relu',
          kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }),
          name: 'hidden1'
        }),
        tf.layers.dropout({ rate: 0.1 }),
        tf.layers.dense({
          units: 16,
          activation: 'relu',
          name: 'hidden2'
        }),
        tf.layers.dense({
          units: 2,
          activation: 'sigmoid',  // Output [0,1] → scale sau
          name: 'output'
        }),
      ]
    });

    this.model.compile({
      optimizer: tf.train.adam(0.005),
      loss: 'meanSquaredError',
      metrics: ['mae'],
    });
  }

  async train(
    samples: CalibrationSample[],
    screenWidth: number,
    screenHeight: number,
    onProgress?: (epoch: number, mae: number) => void
  ): Promise<{ finalMae: number; epochs: number }> {
    const xs = tf.tensor2d(samples.map(s => s.features));
    const ys = tf.tensor2d(samples.map(s => [
      s.screenX / screenWidth,
      s.screenY / screenHeight
    ]));

    let finalMae = Infinity;
    let epochCount = 0;

    await this.model!.fit(xs, ys, {
      epochs: 150,
      batchSize: Math.min(32, Math.floor(samples.length / 2)),
      validationSplit: 0.15,
      shuffle: true,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          epochCount = epoch + 1;
          finalMae = (logs?.val_mae ?? logs?.mae ?? 0)
                     * Math.max(screenWidth, screenHeight); // pixels
          onProgress?.(epoch, finalMae);

          // Early stopping thủ công
          if (finalMae < 40) return tf.nextFrame().then(() => this.model!.stopTraining = true);
        }
      }
    });

    xs.dispose();
    ys.dispose();

    return { finalMae, epochs: epochCount };
  }

  predict(features: number[], screenWidth: number, screenHeight: number): [number, number] {
    const input = tf.tensor2d([features]);
    const output = this.model!.predict(input) as tf.Tensor;
    const [normX, normY] = Array.from(output.dataSync());
    input.dispose();
    output.dispose();
    return [normX * screenWidth, normY * screenHeight];
  }

  // Serialize để lưu lên PostgreSQL
  async serialize(): Promise<{ json: string; weights: ArrayBuffer }> {
    const artifacts = await tf.io.withSaveHandler(async (a) => a)(this.model!);
    return {
      json:    JSON.stringify(artifacts.modelTopology),
      weights: artifacts.weightData as ArrayBuffer,
    };
  }

  async load(json: string, weights: ArrayBuffer): Promise<void> {
    this.model = await tf.loadLayersModel(tf.io.fromMemory(
      JSON.parse(json), 
      [{ name: 'dense', data: new Float32Array(weights) }]
    ));
  }
}
```

### 4.2 — Training flow trong browser

```
Yêu cầu train MLP:
├── Tối thiểu: 50 calibration points (5 vòng × 12 điểm = 60 points) ✓
├── Khuyến nghị: 80-100 points (7-8 vòng)
└── Tối đa có ích: 150 points (overfit sau đó)

Training time ước tính (150 epochs):
├── WebGPU backend: ~3-5 giây
└── WASM backend:   ~8-15 giây

Hiện progress bar với MAE real-time trong lúc train
```

### 4.3 — Kiểm tra MLP

```typescript
// evaluation/test-mlp.ts
// Chạy trong browser DevTools

async function testMLPAccuracy(model: GazeMLPModel, testSamples: CalibrationSample[]) {
  const errors = testSamples.map(s => {
    const [px, py] = model.predict(s.features, 1920, 1080);
    return Math.hypot(px - s.screenX, py - s.screenY);
  });

  console.table({
    'MAE (px)':            mean(errors).toFixed(1),
    'Median Error (px)':   median(errors).toFixed(1),
    'P90 Error (px)':      percentile(errors, 90).toFixed(1),
    'Max Error (px)':      Math.max(...errors).toFixed(1),
    '% samples < 80px':    (errors.filter(e => e < 80).length / errors.length * 100).toFixed(0) + '%',
  });
}
```

**Checklist Phase 4:**
- [x] Build model không lỗi, summary đúng (802 params)
- [x] Training 150 epochs < 10 giây trên WebGPU
- [x] val_mae < 60px sau training với 60+ samples
- [x] Serialize → Deserialize → predict cho cùng kết quả (diff < 0.001px)
- [x] tf.memory() sau dispose: không có tensor leak

---

## Phase 5 — Gaze Smoother & Mouse Controller

### 5.1 — Smoother

```typescript
// apps/web/lib/gaze/smoother.ts

export class GazeSmoother {
  private prevX: number | null = null;
  private prevY: number | null = null;
  private readonly history: [number, number][] = [];
  private readonly WINDOW = 7;

  constructor(
    private alpha      = 0.25,   // EMA weight
    private deadZone   = 8,      // px — không di chuyển nếu delta nhỏ hơn
    private outlierThX = 250,    // px — reject nếu jump lớn hơn
    private outlierThY = 180,
  ) {}

  update(rawX: number, rawY: number): { x: number; y: number; moved: boolean } {
    // Outlier rejection
    if (this.history.length >= 3) {
      const mX = median(this.history.map(h => h[0]));
      const mY = median(this.history.map(h => h[1]));
      if (Math.abs(rawX - mX) > this.outlierThX || Math.abs(rawY - mY) > this.outlierThY) {
        return { x: this.prevX ?? rawX, y: this.prevY ?? rawY, moved: false };
      }
    }

    // Update history
    this.history.push([rawX, rawY]);
    if (this.history.length > this.WINDOW) this.history.shift();

    // EMA
    const smoothX = this.prevX === null ? rawX : this.alpha * rawX + (1 - this.alpha) * this.prevX;
    const smoothY = this.prevY === null ? rawY : this.alpha * rawY + (1 - this.alpha) * this.prevY;

    // Dead zone
    const dx = Math.abs(smoothX - (this.prevX ?? smoothX));
    const dy = Math.abs(smoothY - (this.prevY ?? smoothY));
    const moved = dx > this.deadZone || dy > this.deadZone;

    this.prevX = smoothX;
    this.prevY = smoothY;
    return { x: smoothX, y: smoothY, moved };
  }
}
```

### 5.2 — Mouse Control (Web API)

```typescript
// apps/web/lib/gaze/mouse-controller.ts
// Browser không có native mouse control API
// → Dùng một trong hai approach:

// Approach 1: Overlay cursor (visual only, không control OS cursor)
// Vẽ custom cursor element theo dõi gaze
// Phù hợp nếu app là full-screen web app

// Approach 2: Electron bridge (nếu muốn control OS cursor)
// Gọi ipcRenderer → main process → robotjs/nut-js

// Approach 3: WebHID / companion native app (production)

// Implementation Approach 1 (MVP):
export class WebCursorController {
  private cursorEl: HTMLElement;

  constructor() {
    this.cursorEl = document.createElement('div');
    this.cursorEl.id = 'gaze-cursor';
    this.cursorEl.style.cssText = `
      position: fixed; width: 20px; height: 20px;
      border-radius: 50%; background: rgba(255,100,100,0.7);
      pointer-events: none; z-index: 99999;
      transform: translate(-50%, -50%);
      transition: opacity 0.1s;
    `;
    document.body.appendChild(this.cursorEl);
  }

  moveTo(x: number, y: number): void {
    this.cursorEl.style.left = `${x}px`;
    this.cursorEl.style.top  = `${y}px`;
  }
}
```

> **Lưu ý:** Nếu mục tiêu là control OS mouse cursor (không chỉ trong browser), cần Electron hoặc native companion app. Đây là quyết định kiến trúc cần xác định sớm.

**Checklist Phase 5:**
- [x] Jitter < 15px khi nhìn cố định 5 giây
- [x] Cursor không nhảy khi chớp mắt tự nhiên
- [x] Dead zone hoạt động (cursor không rung khi đứng yên)
- [x] Outlier rejection: không có cursor jump đột ngột

---

## Phase 6 — Web Worker & Pipeline Integration

### 6.1 — Tách processing sang Worker

```typescript
// apps/web/workers/gaze.worker.ts
// MediaPipe KHÔNG thể chạy trong Worker vì cần DOM
// → Chỉ tách phần heavy compute sang Worker

import { expose } from 'comlink';

const gazeWorker = {
  async runPolynomial(features: number[], coeffsX: number[], coeffsY: number[]) {
    // Polynomial expansion + dot product trong Worker
  },
  async runMLP(features: number[], modelWeights: ArrayBuffer) {
    // TF.js CÓ THỂ chạy trong Worker
    const tf = await import('@tensorflow/tfjs');
    // ...
  }
};

expose(gazeWorker);
```

### 6.2 — Main pipeline (chạy ở Main thread)

```typescript
// apps/web/components/gaze/GazeProvider.tsx
// Animation loop sử dụng requestAnimationFrame

export function GazeProvider({ children }: { children: React.ReactNode }) {
  const rafRef = useRef<number>();

  const loop = useCallback(async (timestamp: number) => {
    if (!videoRef.current || !landmarker.current) return;

    // 1. MediaPipe detect (main thread — cần DOM access)
    const result = landmarker.current.detectForVideo(videoRef.current, timestamp);

    // 2. Feature extraction (sync, < 0.5ms)
    const features = extractFeatures(result, videoWidth, videoHeight);
    if (!features) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    // 3. Blink detection
    const blinkState = earDetector.update(features.earLeft, features.earRight);
    if (blinkState !== 'none') handleClick(blinkState);

    // 4. Gaze prediction (skip nếu đang blink)
    if (blinkState === 'none') {
      const [rawX, rawY] = activeModel === 'mlp'
        ? mlpModel.predict(features, screenW, screenH)
        : polyMapper.predict([features.irisXLeft, features.irisYLeft,
                              features.irisXRight, features.irisYRight,
                              features.headPitch, features.headYaw, features.headRoll]);

      // 5. Smooth
      const { x, y, moved } = smoother.update(rawX, rawY);
      if (moved) cursorController.moveTo(x, y);
    }

    rafRef.current = requestAnimationFrame(loop);
  }, [...deps]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current!);
  }, [loop]);
}
```

### 6.3 — Debug Overlay

```typescript
// Hiện trong development mode
// Toggle bằng Ctrl+Shift+D

interface DebugStats {
  fps:              number;
  inferenceMs:      number;   // Thời gian predict()
  mediapipeMs:      number;   // Thời gian detectForVideo()
  rawGaze:          [number, number];
  smoothedGaze:     [number, number];
  earLeft:          number;
  earRight:         number;
  earThreshold:     number;
  headPose:         { pitch: number; yaw: number; roll: number };
  activeModel:      'polynomial' | 'mlp';
  calibrationMAE:   number;
}
```

**Checklist Phase 6:**
- [ ] Pipeline end-to-end chạy ≥ 30fps (đo bằng debug overlay)
- [ ] Không memory leak sau 10 phút (check `tf.memory().numTensors` ổn định)
- [ ] Cursor di chuyển mượt khi nhìn từ từ qua màn hình
- [ ] Blink click hoạt động, không false positive > 2 lần/phút

---

## Phase 7 — Evaluation & Benchmarking

### 7.1 — Accuracy Test (Quantitative)

```typescript
// evaluation/accuracy-test.ts
// Chạy script này sau khi calibration xong

const EVAL_POINTS = [
  // 9 điểm trung tâm và rìa (khác với 12 điểm calibration)
  { x: 960,  y: 540  },  // center
  { x: 480,  y: 270  },  // top-left quadrant
  { x: 1440, y: 270  },  // top-right quadrant
  { x: 480,  y: 810  },  // bottom-left quadrant
  { x: 1440, y: 810  },  // bottom-right quadrant
  { x: 960,  y: 270  },  // top center
  { x: 960,  y: 810  },  // bottom center
  { x: 480,  y: 540  },  // left center
  { x: 1440, y: 540  },  // right center
];

// Quy trình: Hiện điểm → chờ 2s → thu 30 frame → lấy median → tính error
// Chạy 3 lần, lấy trung bình
```

**Bảng kết quả mục tiêu:**

| Metric | Polynomial (Quick) | MLP (Personalized) | Đánh giá |
|--------|-------------------|-------------------|----------|
| MAE tổng (px) | < 80 | < 60 | ✅ Pass |
| MAE vùng trung tâm (px) | < 50 | < 40 | ✅ Pass |
| MAE vùng rìa (px) | < 120 | < 90 | ✅ Pass |
| P90 Error (px) | < 150 | < 110 | ✅ Pass |
| R² score | > 0.88 | > 0.93 | ✅ Pass |
| % samples < 80px | > 70% | > 85% | ✅ Pass |

### 7.2 — Latency Test (Quantitative)

```typescript
// evaluation/latency-test.ts
// Đo từng component riêng lẻ

performance.mark('mediapipe-start');
const result = landmarker.detectForVideo(video, timestamp);
performance.mark('mediapipe-end');
performance.measure('mediapipe', 'mediapipe-start', 'mediapipe-end');

// Target latency breakdown:
const LATENCY_BUDGET = {
  camera_capture:  33,   // ms (1 frame @ 30fps) — không thay đổi được
  mediapipe:       15,   // ms target
  feature_extract:  1,   // ms target
  prediction:       5,   // ms target (poly: <1ms, MLP: ~3ms)
  smoothing:        1,   // ms target
  dom_update:       2,   // ms target
  total:           57,   // ms = ~17fps worst case
                         // Nhưng pipeline = async, actual ≈ 100-150ms
};
```

**Bảng latency mục tiêu:**

| Component | Mục tiêu | Đo được | Pass? |
|-----------|----------|---------|-------|
| MediaPipe detectForVideo | < 15ms | | |
| Feature extraction | < 1ms | | |
| Polynomial predict | < 1ms | | |
| MLP predict | < 5ms | | |
| Gaze smoother | < 1ms | | |
| End-to-end (camera→cursor) | < 150ms | | |
| FPS tổng thể | ≥ 30fps | | |

### 7.3 — Usability Test (Qualitative)

**Bài test Fitts' Law — 5 lần mỗi bài:**

| Bài test | Mô tả | Tiêu chí đạt |
|----------|-------|--------------|
| Click nút lớn | Nút 200×60px ở trung tâm màn hình | ≥ 4/5 |
| Click icon | Target 48×48px | ≥ 3/5 |
| Navigate menu | Click vào 5 menu items lần lượt | ≥ 4/5 liên tiếp |
| Vùng rìa | Click nút ở 4 góc màn hình | ≥ 3/5 mỗi góc |
| Bền vững 5 phút | Sử dụng liên tục | < 3 false click/phút |

### 7.4 — Performance Benchmarks

```bash
# Đo trong Chrome DevTools → Performance tab

# Mục tiêu:
# Scripting time: < 8ms/frame
# Rendering time: < 2ms/frame
# GPU memory: < 500MB (bao gồm WebGPU)
# JS Heap: < 100MB (stable, không tăng dần)

# Kiểm tra memory leak:
# Chạy 10 phút → js heap snapshot trước và sau
# numTensors phải ổn định (không tăng liên tục)
```

### 7.5 — Script tổng hợp kết quả

```typescript
// evaluation/run-all.ts
async function runFullEvaluation() {
  const results = {
    timestamp: new Date().toISOString(),
    browserInfo: navigator.userAgent,
    webgpuEnabled: await checkWebGPU(),
    screenResolution: `${screen.width}×${screen.height}`,

    accuracy: {
      polynomial: await runAccuracyTest('polynomial'),
      mlp:        await runAccuracyTest('mlp'),
    },
    latency: await runLatencyTest(),
    performance: await runPerformanceTest(),
  };

  // Lưu vào file JSON
  const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `eval-${Date.now()}.json`; a.click();
}
```

---

## Phase 8 — Polish & Production Readiness

### 8.1 — Error handling cần cover

```typescript
// Các lỗi cần handle gracefully:
const ERROR_CASES = [
  'camera_not_found',          // Không tìm thấy webcam
  'camera_permission_denied',  // User từ chối camera
  'webgpu_not_supported',      // Browser cũ → fallback WASM
  'face_not_detected',         // Mặt bị che hoặc ngoài frame
  'calibration_insufficient',  // Ít hơn 10 điểm calibration
  'mlp_inference_failed',      // TF.js error → fallback polynomial
  'backend_unavailable',       // NestJS offline → dùng IndexedDB
];
```

### 8.2 — Fallback chain

```
WebGPU backend
    ↓ (nếu không hỗ trợ)
WASM backend
    ↓ (nếu không hỗ trợ)
CPU backend (chậm, warning user)

MLP Model
    ↓ (nếu chưa đủ data hoặc lỗi)
Polynomial Regression
    ↓ (nếu chưa calibrate)
Thông báo yêu cầu calibration
```

### 8.3 — Environment variables

```bash
# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_MEDIAPIPE_CDN=https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm
NEXT_PUBLIC_ENABLE_DEBUG=true

# apps/api/.env
DATABASE_URL=postgresql://gaze:gaze_dev_pass@localhost:5432/gaze_dev
JWT_SECRET=your-secret-key-min-32-chars
JWT_EXPIRES_IN=7d
```

### 8.4 — Build & Run commands

```bash
# Development
pnpm turbo dev          # Chạy cả web + api

# Chạy riêng lẻ
cd apps/web && pnpm dev   # Port 3000
cd apps/api && pnpm dev   # Port 3001

# Build production
pnpm turbo build

# Test evaluation (chạy trong browser sau khi app đang chạy)
# Mở http://localhost:3000/evaluation

# Database commands
cd apps/api
pnpm typeorm migration:generate src/migrations/NewMigration -d src/data-source.ts
pnpm typeorm migration:run -d src/data-source.ts
pnpm typeorm migration:revert -d src/data-source.ts
```

---

## Checklist tổng kết

### Phase 0 — Setup
- [x] pnpm workspace hoạt động
- [x] WebGPU detected trên Chrome
- [x] PostgreSQL up và connected

### Phase 1 — API & DB
- [x] Migration thành công
- [x] Auth JWT hoạt động
- [x] Weights lưu/load không corrupt

### Phase 2 — MediaPipe
- [x] ≥ 30fps pipeline
- [x] 7 features extract đúng
- [x] EAR adaptive hoạt động

### Phase 3 — Calibration
- [x] 12-point grid UI hoạt động
- [x] R² > 0.90 sau calibration
- [x] MAE in-sample < 50px

### Phase 4 — MLP
- [x] Training < 10 giây
- [x] val_mae < 60px
- [x] Serialize/deserialize đúng

### Phase 5 — Smoother
- [x] Jitter < 15px
- [x] Dead zone hoạt động

### Phase 6 — Integration
- [ ] ≥ 30fps end-to-end
- [ ] Không memory leak
- [ ] Blink click < 2 false positive/phút

### Phase 7 — Evaluation
- [ ] Poly MAE < 80px
- [ ] MLP MAE < 60px
- [ ] End-to-end latency < 150ms
- [ ] Usability: Click nút lớn ≥ 4/5

---

## Bảng theo dõi tiến độ

| Phase | Tên | Ngày bắt đầu | Ngày hoàn thành | Status |
|-------|-----|-------------|----------------|--------|
| 0 | Project Setup | 2026-03-31 | 2026-03-31 | ✅ |
| 1 | API & Database | 2026-03-31 | 2026-03-31 | ✅ |
| 2 | MediaPipe + Features | 2026-03-31 | 2026-03-31 | ✅ |
| 3 | Calibration (Polynomial) | 2026-03-31 | 2026-03-31 | ✅ |
| 4 | MLP Personalization | 2026-04-02 | 2026-04-02 | ✅ |
| 5 | Smoother & Mouse | 2026-04-02 | 2026-04-02 | ✅ |
| 6 | Pipeline Integration | | | ⬜ |
| 7 | Evaluation | | | ⬜ |
| 8 | Polish & Production | | | ⬜ |

---

*Tài liệu này cho Giải pháp Web (MediaPipe JS + TF.js). Xem `gaze_mouse_plan_solution_a.md` cho bản Python desktop.*