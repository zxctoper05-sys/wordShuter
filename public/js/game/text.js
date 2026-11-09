// Нормализация ввода: регистр не важен, «ё» набирается как «е».
export const norm = (s) => s.toLowerCase().replace(/ё/g, 'е');
