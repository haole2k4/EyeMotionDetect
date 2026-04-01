# Hướng dẫn triển khai Phase 4: Gaze MLP Personalization Model

Tài liệu này đóng vai trò hướng dẫn tích hợp và kiểm tra Phase 4 với `TensorFlow.js` ngay trên trình duyệt, kết hợp backend PostgreSQL.

## 1. Cấu trúc đã thêm

- `apps/web/lib/gaze/mlp-model.ts`: Chứa lớp `GazeMLPModel` giúp khởi tạo, `build()`, và `train()` mạng neural đa lớp MLP (802 tham số) bằng `@tensorflow/tfjs`.
- `apps/web/lib/gaze/storage.ts`: Mở rộng IndexedDB logic để lưu được model struct (`json`) và model weights (`ArrayBuffer`).
- `apps/web/workers/gaze.worker.ts`: Web Worker để offload quá trình predict với Comlink (bọc `tfjs` độc lập với Main thread).
- `evaluation/test-mlp.ts`: Kịch bản đánh giá MAE (Mean Absolute Error).

## 2. Kiểm tra TF.js và WebGPU Backend

TF.js hỗ trợ WebGPU để gia tốc rất mạnh (train < 5s):
1. **Kiểm tra tương thích**: Khi khởi tạo app, Chrome từ version 121+ đã có mặc định WebGPU (nhưng phải có module `@tensorflow/tfjs-backend-webgpu`).
2. **Khởi tạo backend** (nên gọi một lần lúc Root Layout loading hoặc context Provider loading):
   ```ts
   import * as tf from '@tensorflow/tfjs';
   import '@tensorflow/tfjs-backend-webgpu';

   await tf.setBackend('webgpu');
   await tf.ready();
   ```

## 3. Cách chạy Test Calibration

Mở devtools console và import thư viện `evaluation/test-mlp.ts`.
Hoặc gọi hàm trực tiếp ở 1 component nút bấm Debug:

```ts
import { GazeMLPModel } from '@/lib/gaze/mlp-model';
import { testMLPAccuracy } from '../../../evaluation/test-mlp';

async function mockTest() {
  const model = new GazeMLPModel();
  model.build();

  // Khởi tạo sample mock data hoặc lấy từ CalibrationSession
  // samples: CalibrationSample[] = calibrationSession.getSamples();
  // Vòng lắp qua các mẫu để train
  
  await model.train(samples, 1920, 1080, (ep, mae) => {
    console.log(`Epoch ${ep} -> MAE: ${mae}px`);
  });

  // Tái đánh giá dữ liệu để xem MAE (< 60px)
  await testMLPAccuracy(model, samples);
}
```

## 4. Đồng bộ dữ liệu Blob lên PostgreSQL NestJS

Sau khi model được serialize ra Binary `ArrayBuffer`:
1. Trong NestJS: Tạo endpoint REST (hoặc trích từ Phase 1) có Controller nhận `multipart/form-data`.
2. NestJS Schema `weights.entity.ts` chứa `mlpWeightsBin: Buffer`.
3. Từ Frontend Next.js:
   ```ts
   const { json, weights } = await model.serialize();
   const blob = new Blob([weights], { type: "application/octet-stream" });

   const formData = new FormData();
   formData.append('modelTopology', json);
   formData.append('weightsBin', blob);

   await fetch('/api/weights/mlp', {
      method: "PUT",
      body: formData, 
      headers: { "Authorization": `Bearer ${token}` }
   });
   ```

## 5. Xác nhận (Verification)
- Gọi `pnpm turbo build` để chắc chắn không lỗi TypeScript.
- Dùng `idb` Storage devtools để thấy model lưu vào ổ cứng mượt mà.
- Database container `eyemotiondetect` postgresql: gọi query xem field `mlpWeightsBin` có data không null.
