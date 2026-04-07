/**
 * Ánh xạ tọa độ vật lý (x, y) trên màn hình thành chỉ số dòng/cột (row, col) trong Grid 3x3.
 *
 * @param x Tọa độ pixel X từ MLP/Polynomial model.
 * @param y Tọa độ pixel Y từ MLP/Polynomial model.
 * @param screenWidth Chiều rộng màn hình (px)
 * @param screenHeight Chiều cao màn hình (px)
 * @returns Object chứa `row` và `col` (giá trị int từ 0 đến 2).
 */
export function getGridCell(
  x: number,
  y: number,
  screenWidth: number,
  screenHeight: number
): { row: number; col: number } {
  // Tránh lỗi chia cho 0 nếu screenWidth/height không hợp lệ
  const w = screenWidth || 1;
  const h = screenHeight || 1;

  // Tính toán chỉ số nguyên bằng cách chia 3 khoảng đều nhau cho màn hình.
  const rawCol = Math.floor((x / w) * 3);
  const rawRow = Math.floor((y / h) * 3);

  return {
    // Luôn luôn kẹp cứng nằm trong [0, 2] để tránh việc nhìn vượt giới hạn biên
    row: Math.max(0, Math.min(2, rawRow)),
    col: Math.max(0, Math.min(2, rawCol)),
  };
}

/**
 * Bản đồ Action rập theo layout:
 * [A,      Prev,     B]
 * [Submit, Deadzone, Flag]
 * [C,      Next,     D]
 */
const ACTION_LAYOUT = [
  ['A', 'PREV', 'B'],
  ['SAFE_MARGIN', 'DEADZONE', 'NEXT'],
  ['C', 'SUBMIT', 'D']
] as const;

export type GridActionId = typeof ACTION_LAYOUT[number][number];

/**
 * Ánh xạ dòng và cột thành ID Action. 
 * @param row 0 tới 2
 * @param col 0 tới 2
 * @returns Chuỗi tên Hành động, hoặc DEADZONE làm mặc định an toàn.
 */
export function getActionFromGrid(row: number, col: number): GridActionId {
  if (row >= 0 && row <= 2 && col >= 0 && col <= 2) {
    return ACTION_LAYOUT[row][col];
  }
  return 'DEADZONE';
}
