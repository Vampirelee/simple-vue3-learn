function lengthOfLongestSubstring(s) {
  let startIndex = 0,
    endIndex = 0;
  const length = s.length;
  const temp = {};
  let max = 0;
  for (endIndex = startIndex; endIndex < length; endIndex++) {
    const char = s[endIndex];
    if (temp[char] === void 0) {
      temp[char] = endIndex;
      const size = endIndex - startIndex + 1;
      if (size > max) max = size;
    } else {
      const nextStartIndex = temp[char] + 1;
      for (let j = startIndex; j < nextStartIndex; j++) {
        delete temp[s[j]];
      }
      temp[char] = endIndex;
      startIndex = nextStartIndex;
    }
  }
  return max;
}
console.log(lengthOfLongestSubstring("abcabcbb"));