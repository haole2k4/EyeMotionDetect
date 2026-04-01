import * as tf from '@tensorflow/tfjs';
import { GazeMLPModel } from '../apps/web/lib/gaze/mlp-model';
import { testMLPAccuracy } from './test-mlp';
import type { CalibrationSample } from '../apps/web/lib/gaze/types';

async function generateMockData(count: number): Promise<CalibrationSample[]> {
  const samples: CalibrationSample[] = [];
  const screenW = 1920;
  const screenH = 1080;

  for (let i = 0; i < count; i++) {
    // Giả lập ánh xạ (iris, headpose) -> (screenX, screenY)
    // Mắt người có tương quan iris và vị trí trên màn hình
    const irisXLeft = Math.random() * 0.6 + 0.2; // 0.2 -> 0.8
    const irisYLeft = Math.random() * 0.6 + 0.2;
    
    // Mắt phải thường đối xứng x, cùng y
    const irisXRight = 1 - irisXLeft; 
    const irisYRight = irisYLeft;

    // Headpose có tương quan nhất định
    const yaw = (irisXLeft - 0.5) * 40; // -20 to 20 độ
    const pitch = (irisYLeft - 0.5) * 30; // -15 to 15 độ
    const roll = 0;

    // Target giả định tương đương tuyến tính + một chút noise (1-2px)
    const screenX = (irisXLeft - 0.2) / 0.6 * screenW + (Math.random() - 0.5) * 4;
    const screenY = (irisYLeft - 0.2) / 0.6 * screenH + (Math.random() - 0.5) * 4;

    samples.push({
      features: [irisXLeft, irisYLeft, irisXRight, irisYRight, pitch, yaw, roll],
      screenX,
      screenY,
      timestamp: Date.now() + i * 33
    });
  }

  return samples;
}

async function run() {
  console.log('--- KHỞI ĐỘNG KIỂM TRA MLP MODEL ---');
  await tf.ready();
  console.log('TF Backend đang dùng:', tf.getBackend()); // Node.js thường dùng 'cpu'

  console.log('\n1. Khởi tạo Mock Data (100 mẫu calibration)...');
  const samples = await generateMockData(100);

  console.log('\n2. Build GazeMLPModel (Kiến trúc 7-32-16-2)...');
  const model = new GazeMLPModel();
  model.build();

  console.log('\n3. Bắt đầu quá trình Training (Max 150 epochs, có Early Stopping)...');
  const startTime = Date.now();
  const { epochs, finalMae } = await model.train(samples, 1920, 1080, (epoch, mae) => {
    if (epoch === 1 || epoch % 20 === 0) {
      console.log(` - Epoch ${epoch}: MAE = ${mae.toFixed(1)}px`);
    }
  });
  const timeTaken = (Date.now() - startTime) / 1000;

  console.log(`\n✅ Train hoàn tất sau ${timeTaken.toFixed(2)} giây (${epochs} epochs). Final Training MAE: ${finalMae.toFixed(1)}px`);

  console.log('\n4. Đánh giá tính chính xác của mô hình...');
  // Đánh giá với 30 mẫu test mới (Out of sample data chưa từng nhìn thấy trong tập train validation)
  const testSamples = await generateMockData(30);
  await testMLPAccuracy(model, testSamples);

  console.log('\n5. Kiểm tra tính toàn vẹn của logic Serialize / Deserialize PostgreSQL...');
  console.log('   (Serialize model thành Binary Blob)');
  const { json, weights } = await model.serialize();
  console.log(`   - Model Topology JSON Size : ${(json.length / 1024).toFixed(2)} KB`);
  console.log(`   - Model Weights Blob Size  : ${(weights.byteLength / 1024).toFixed(2)} KB`);

  console.log('   (Tạo Model mới và Deserialize từ Blob)');
  const reconstructedModel = new GazeMLPModel();
  await reconstructedModel.load(json, weights);
  
  const testFeature = testSamples[0].features;
  const originalPred = model.predict(testFeature, 1920, 1080);
  const reconsPred = reconstructedModel.predict(testFeature, 1920, 1080);

  const diffX = Math.abs(originalPred[0] - reconsPred[0]);
  const diffY = Math.abs(originalPred[1] - reconsPred[1]);
  if (diffX < 0.001 && diffY < 0.001) {
    console.log('✅ PASS: Trí nhớ Weights bảo toàn chính xác qua Blob');
  } else {
    console.log(`❌ FAIL: Độ lệch sau Deserialize: x=${diffX}, y=${diffY}`);
  }
}

run().catch(console.error);
