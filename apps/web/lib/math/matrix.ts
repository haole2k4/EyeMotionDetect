export function transpose(m: number[][]): number[][] {
  return m[0].map((_, c) => m.map(r => r[c]));
}

export function multiply(a: number[][], b: number[][]): number[][] {
  const result = Array(a.length).fill(0).map(() => Array(b[0].length).fill(0));
  for (let r = 0; r < a.length; ++r) {
    for (let c = 0; c < b[0].length; ++c) {
      for (let i = 0; i < a[0].length; ++i) {
        result[r][c] += a[r][i] * b[i][c];
      }
    }
  }
  return result;
}

export function identity(size: number): number[][] {
  const result = Array(size).fill(0).map(() => Array(size).fill(0));
  for (let i = 0; i < size; ++i) result[i][i] = 1;
  return result;
}

export function add(a: number[][], b: number[][]): number[][] {
  return a.map((row, i) => row.map((val, j) => val + b[i][j]));
}

export function inverse(m: number[][]): number[][] {
  const n = m.length;
  const a = m.map((row, i) => {
    const newRow = row.slice();
    for (let j = 0; j < n; ++j) {
      newRow.push(i === j ? 1 : 0);
    }
    return newRow;
  });

  for (let i = 0; i < n; i++) {
    let maxEl = Math.abs(a[i][i]);
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(a[k][i]) > maxEl) {
        maxEl = Math.abs(a[k][i]);
        maxRow = k;
      }
    }

    for (let k = i; k < 2 * n; k++) {
      const tmp = a[maxRow][k];
      a[maxRow][k] = a[i][k];
      a[i][k] = tmp;
    }

    const p = a[i][i];
    if (Math.abs(p) < 1e-10) throw new Error('Matrix is singular');
    for (let k = i; k < 2 * n; k++) a[i][k] /= p;

    for (let j = 0; j < n; j++) {
      if (i !== j) {
        const factor = a[j][i];
        for (let k = i; k < 2 * n; k++) {
          a[j][k] -= factor * a[i][k];
        }
      }
    }
  }

  return a.map(row => row.slice(n, 2 * n));
}
