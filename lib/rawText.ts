/** 원문 Unicode 코드 포인트 수. 공백·줄바꿈·기호를 보존하고 정규화하지 않는다. */
export const countRawText = (value: string) => Array.from(value).length;
