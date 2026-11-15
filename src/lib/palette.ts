// Tag colours: mid-tone hues chosen to read on both the dark and light themes.
// Keys are stored in the database; hex values can be tuned here without migrating data.
export const TAG_COLORS: { key: string; name: string; hex: string }[] = [
  { key: 'slate', name: 'Slate', hex: '#6F93B8' }, { key: 'blue', name: 'Blue', hex: '#5B7FD6' },
  { key: 'indigo', name: 'Indigo', hex: '#6E6AD6' }, { key: 'violet', name: 'Violet', hex: '#9277CC' },
  { key: 'purple', name: 'Purple', hex: '#A363C7' }, { key: 'pink', name: 'Pink', hex: '#C9649E' },
  { key: 'rose', name: 'Rose', hex: '#D46A80' }, { key: 'red', name: 'Red', hex: '#D0625A' },
  { key: 'coral', name: 'Coral', hex: '#DD7A5B' }, { key: 'orange', name: 'Orange', hex: '#D98A3A' },
  { key: 'amber', name: 'Amber', hex: '#C48A3A' }, { key: 'gold', name: 'Gold', hex: '#C9A23A' },
  { key: 'olive', name: 'Olive', hex: '#8E9A3A' }, { key: 'lime', name: 'Lime', hex: '#8DB43A' },
  { key: 'green', name: 'Green', hex: '#4FA36B' }, { key: 'teal', name: 'Teal', hex: '#3E9E99' },
  { key: 'cyan', name: 'Cyan', hex: '#3A9BC4' }, { key: 'brown', name: 'Brown', hex: '#9C7458' },
  { key: 'stone', name: 'Stone', hex: '#8C8C86' }, { key: 'graphite', name: 'Graphite', hex: '#6A6A72' },
];
const byKey = new Map(TAG_COLORS.map((c) => [c.key, c.hex]));
export const tagHex = (key: string) => byKey.get(key) ?? '#8C8C86';
