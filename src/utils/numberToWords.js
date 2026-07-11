// Converts a peso amount (e.g. 12345.50) into words for the Cash Voucher
// "Amount in Words" line, e.g. "Twelve Thousand Three Hundred Forty-Five
// Pesos and 50/100".

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
];
const SCALES = ['', 'Thousand', 'Million', 'Billion'];

function threeDigitsToWords(n) {
  let str = '';
  if (n >= 100) {
    str += `${ONES[Math.floor(n / 100)]} Hundred `;
    n %= 100;
  }
  if (n >= 20) {
    str += `${TENS[Math.floor(n / 10)]}`;
    if (n % 10) str += `-${ONES[n % 10]}`;
    str += ' ';
  } else if (n > 0) {
    str += `${ONES[n]} `;
  }
  return str.trim();
}

function integerToWords(n) {
  if (n === 0) return 'Zero';

  let scaleIndex = 0;
  const parts = [];
  while (n > 0) {
    const chunk = n % 1000;
    if (chunk) {
      const words = threeDigitsToWords(chunk);
      parts.unshift(SCALES[scaleIndex] ? `${words} ${SCALES[scaleIndex]}` : words);
    }
    n = Math.floor(n / 1000);
    scaleIndex += 1;
  }
  return parts.join(' ').trim();
}

export function amountToWords(amount) {
  const value = Math.abs(Number(amount) || 0);
  const pesos = Math.floor(value);
  const centavos = Math.round((value - pesos) * 100);

  const pesoWords = integerToWords(pesos);
  const pesoLabel = pesos === 1 ? 'Peso' : 'Pesos';

  const centavoStr = String(centavos).padStart(2, '0');

  return `${pesoWords} ${pesoLabel} and ${centavoStr}/100`;
}
