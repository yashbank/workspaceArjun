import { describe, it, expect } from 'vitest';
import { planFolderImport } from './folder-import-plan';

/** Minimal File stand-in carrying a drag-drop relativePath. */
function dragFile(relativePath: string): File {
  return { relativePath, name: relativePath.split('/').pop() ?? '' } as unknown as File;
}

/** Minimal File stand-in carrying a folder-picker webkitRelativePath. */
function pickerFile(webkitRelativePath: string): File {
  return {
    webkitRelativePath,
    name: webkitRelativePath.split('/').pop() ?? '',
  } as unknown as File;
}

// The canonical example tree:
//   Project/
//   ├── file1.pdf
//   ├── Docs/{a.pdf, b.pdf}
//   └── Assets/Icons/logo.png
const EXAMPLE = [
  'Project/file1.pdf',
  'Project/Docs/a.pdf',
  'Project/Docs/b.pdf',
  'Project/Assets/Icons/logo.png',
];

describe('planFolderImport', () => {
  it('recreates the full directory tree, grouped by depth', () => {
    const plan = planFolderImport(EXAMPLE.map(dragFile));

    expect(plan.rootName).toBe('Project');
    expect(plan.levels).toHaveLength(3);

    expect(plan.levels[0].map((d) => d.path)).toEqual(['Project']);
    expect(plan.levels[0][0].parentPath).toBeNull();

    expect(plan.levels[1].map((d) => d.path).sort()).toEqual([
      'Project/Assets',
      'Project/Docs',
    ]);
    for (const d of plan.levels[1]) expect(d.parentPath).toBe('Project');

    expect(plan.levels[2].map((d) => d.path)).toEqual(['Project/Assets/Icons']);
    expect(plan.levels[2][0].parentPath).toBe('Project/Assets');
    expect(plan.levels[2][0].name).toBe('Icons');
  });

  it('creates intermediate folders that hold no direct file (Assets)', () => {
    const plan = planFolderImport(EXAMPLE.map(dragFile));
    const allPaths = plan.levels.flat().map((d) => d.path);
    expect(allPaths).toContain('Project/Assets');
  });

  it('maps each file into its correct directory path', () => {
    const plan = planFolderImport(EXAMPLE.map(dragFile));
    const byName = (n: string) =>
      plan.files.find((f) => (f.file as unknown as { name: string }).name === n)?.dirPath;

    expect(byName('file1.pdf')).toBe('Project');
    expect(byName('a.pdf')).toBe('Project/Docs');
    expect(byName('b.pdf')).toBe('Project/Docs');
    expect(byName('logo.png')).toBe('Project/Assets/Icons');
  });

  it('does not duplicate a shared directory', () => {
    const plan = planFolderImport(EXAMPLE.map(dragFile));
    const docsCount = plan.levels.flat().filter((d) => d.path === 'Project/Docs').length;
    expect(docsCount).toBe(1);
  });

  it('handles the folder-picker webkitRelativePath the same way', () => {
    const plan = planFolderImport(EXAMPLE.map(pickerFile));
    expect(plan.rootName).toBe('Project');
    expect(plan.levels[2][0].path).toBe('Project/Assets/Icons');
    expect(
      plan.files.find((f) => (f.file as unknown as { name: string }).name === 'logo.png')
        ?.dirPath,
    ).toBe('Project/Assets/Icons');
  });

  it('places a file with no directory component at the import target ("")', () => {
    const plan = planFolderImport([dragFile('loose.txt')]);
    expect(plan.levels).toHaveLength(0);
    expect(plan.files[0].dirPath).toBe('');
  });
});
