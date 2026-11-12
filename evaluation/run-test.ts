import { PolynomialGazeMapper } from '../apps/web/lib/gaze/polynomial';
import { testPolynomialAccuracy } from './test-mlp';
import type { CalibrationSample } from '../apps/web/lib/gaze/types';

async function generateMockData(count: number): Promise<CalibrationSample[]> {
  const samples: CalibrationSample[] = [];
  const screenW = 1920;
  const screenH = 1080;

  for (let i = 0; i < count; i++) {
    // Giả lập ánh xạ (iris, headpose) -> (screenX, screenY)
    const irisXLeft = Math.random() * 0.6 + 0.2; // 0.2 -> 0.8
    const irisYLeft = Math.random() * 0.6 + 0.2;

    const irisXRight = 1 - irisXLeft;
    const irisYRight = irisYLeft;

    const yaw = (irisXLeft - 0.5) * 40;
    const pitch = (irisYLeft - 0.5) * 30;
    const roll = 0;

    // Target tuyến tính + một chút noise (1-2px)
    const screenX = ((irisXLeft - 0.2) / 0.6) * screenW + (Math.random() - 0.5) * 4;
    const screenY = ((irisYLeft - 0.2) / 0.6) * screenH + (Math.random() - 0.5) * 4;

    samples.push({
      features: [irisXLeft, irisYLeft, irisXRight, irisYRight, pitch / 90, yaw / 90, roll / 90],
      screenX,
      screenY,
      timestamp: Date.now() + i * 33,
    });
  }

  return samples;
}

async function run() {
  console.log('--- KHỞI ĐỘNG KIỂM TRA 18D HUBER RIDGE SVD (POLYNOMIAL GAZE MAPPER) ---');

  console.log('\n1. Khởi tạo Mock Data (100 mẫu calibration)...');
  const samples = await generateMockData(100);

  console.log('\n2. Khởi tạo PolynomialGazeMapper (18D Huber IRLS SVD/Jacobi)...');
  const mapper = new PolynomialGazeMapper();

  console.log('\n3. Bắt đầu quá trình Huấn luyện (5 vòng IRLS)...');
  const startTime = performance.now();
  const fitMetrics = mapper.fit(samples);
  const timeTaken = performance.now() - startTime;

  console.log(`\nHuấn luyện hoàn tất trong ${timeTaken.toFixed(3)} ms!`);
  console.log(` - MAE 2D : ${fitMetrics.mae2D.toFixed(1)} px`);
  console.log(` - Inlier Ratio : ${(fitMetrics.inlierRatio * 100).toFixed(1)}%`);
  console.log(` - R2 X : ${fitMetrics.r2X.toFixed(3)} | R2 Y : ${fitMetrics.r2Y.toFixed(3)}`);

  console.log('\n4. Đánh giá tính chính xác ngoài tập huấn luyện (30 mẫu test độc lập)...');
  const testSamples = await generateMockData(30);
  await testPolynomialAccuracy(mapper, testSamples);

  console.log('\n5. Kiểm tra tính toàn vẹn của Serialize / Deserialize JSON...');
  const serialized = mapper.serialize();
  console.log(`   - Số lượng hệ số X: ${serialized.coeffsX.length}, Y: ${serialized.coeffsY.length}`);

  const restoredMapper = new PolynomialGazeMapper();
  restoredMapper.load(serialized);

  const testFeature = testSamples[0].features;
  const originalPred = mapper.predict(testFeature);
  const restoredPred = restoredMapper.predict(testFeature);

  const diffX = Math.abs(originalPred[0] - restoredPred[0]);
  const diffY = Math.abs(originalPred[1] - restoredPred[1]);

  if (diffX < 1e-9 && diffY < 1e-9) {
    console.log('PASS: Hệ số weights bảo toàn chính xác 100% qua Serialize/Deserialize');
  } else {
    console.error(`FAIL: Độ lệch sau Deserialize: x=${diffX}, y=${diffY}`);
  }
}

run().catch(console.error);
