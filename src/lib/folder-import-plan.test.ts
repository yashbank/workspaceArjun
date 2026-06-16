import { describe, it, expect } from 'vitest';
import { planFolderImport, hasImportPath, isJunkFile } from './folder-import-plan';

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

describe('planFolderImport — junk filtering', () => {
  it('excludes OS junk files but keeps the real files', () => {
    const plan = planFolderImport(
      [
        'Project/.DS_Store',
        'Project/file1.pdf',
        'Project/Docs/.DS_Store',
        'Project/Docs/a.pdf',
        'Project/Docs/Thumbs.db',
        'Project/desktop.ini',
        'Project/.localized',
      ].map(dragFile),
    );
    const names = plan.files
      .map((f) => (f.file as unknown as { name: string }).name)
      .sort();
    expect(names).toEqual(['a.pdf', 'file1.pdf']);
    expect(names).not.toContain('.DS_Store');
    expect(names).not.toContain('Thumbs.db');
    expect(names).not.toContain('desktop.ini');
    expect(names).not.toContain('.localized');
  });

  it('keeps genuine dotfiles such as .env', () => {
    const plan = planFolderImport([dragFile('Project/.env'), dragFile('Project/app.js')]);
    const names = plan.files
      .map((f) => (f.file as unknown as { name: string }).name)
      .sort();
    expect(names).toEqual(['.env', 'app.js']);
  });

  it('still nests real files when junk is interleaved', () => {
    const plan = planFolderImport(
      ['Project/Docs/.DS_Store', 'Project/Docs/a.pdf'].map(dragFile),
    );
    expect(plan.files).toHaveLength(1);
    expect(plan.files[0].dirPath).toBe('Project/Docs');
    expect(plan.levels.flat().map((d) => d.path).sort()).toEqual([
      'Project',
      'Project/Docs',
    ]);
  });
});

describe('isJunkFile — robust OS-metadata detection', () => {
  it('flags exact known junk names', () => {
    for (const n of ['.DS_Store', 'Thumbs.db', 'desktop.ini', '.localized', '.Spotlight-V100']) {
      expect(isJunkFile(n)).toBe(true);
    }
  });

  it('flags junk case-insensitively', () => {
    expect(isJunkFile('.ds_store')).toBe(true);
    expect(isJunkFile('THUMBS.DB')).toBe(true);
  });

  it('flags AppleDouble sidecars (._name) and the custom-icon file', () => {
    expect(isJunkFile('._photo.jpg')).toBe(true);
    expect(isJunkFile('._')).toBe(true);
    expect(isJunkFile('Icon\r')).toBe(true);
  });

  it('keeps genuine dotfiles and real files', () => {
    for (const n of ['.env', '.gitignore', '.npmrc', 'report.pdf', 'design.cdr']) {
      expect(isJunkFile(n)).toBe(false);
    }
  });

  it('drops files nested under a __MACOSX wrapper folder', () => {
    const plan = planFolderImport([
      { relativePath: 'Project/__MACOSX/._file', name: '._file' },
      { relativePath: 'Project/__MACOSX/file.pdf', name: 'file.pdf' },
      { relativePath: 'Project/real.pdf', name: 'real.pdf' },
    ] as unknown as File[]);
    const names = plan.files.map((f) => (f.file as unknown as { name: string }).name);
    expect(names).toEqual(['real.pdf']);
    expect(plan.levels.flat().map((d) => d.path)).not.toContain('Project/__MACOSX');
  });
});

describe('planFolderImport — NFC normalization', () => {
  // Built from code points so this file stays ASCII:
  // NFD = "Cafe" + combining acute accent (U+0301); NFC = precomposed form.
  const NFD = 'Cafe' + String.fromCharCode(0x301);
  const NFC = NFD.normalize('NFC');

  it('normalizes a decomposed (NFD) path segment to NFC', () => {
    expect(NFD).not.toBe(NFC); // sanity: the two encodings differ
    const plan = planFolderImport([dragFile(`${NFD}/menu.txt`)]);
    expect(plan.levels[0][0].path).toBe(NFC);
    expect(plan.files[0].dirPath).toBe(NFC);
  });

  it('keeps a single folder regardless of NFD/NFC input form', () => {
    const plan = planFolderImport([dragFile(`${NFD}/a.txt`), dragFile(`${NFC}/b.txt`)]);
    expect(plan.levels[0]).toHaveLength(1);
    expect(plan.levels[0][0].path).toBe(NFC);
  });
});

describe('hasImportPath', () => {
  it('detects a folder-picker file via webkitRelativePath', () => {
    expect(hasImportPath(pickerFile('Project/Docs/a.pdf'))).toBe(true);
  });

  it('detects a drag-import file via relativePath', () => {
    expect(hasImportPath(dragFile('Project/a.pdf'))).toBe(true);
  });

  it('is false for a plain file with no relative path', () => {
    expect(hasImportPath({ name: 'a.pdf' } as unknown as File)).toBe(false);
  });
});

describe('planFolderImport — nested hierarchy regression', () => {
  it('preserves a 3-level tree end to end', () => {
    const plan = planFolderImport(
      ['Parent/file1', 'Parent/SubA/file2', 'Parent/SubA/SubB/file3'].map(dragFile),
    );
    expect(plan.levels.map((lvl) => lvl.map((d) => d.path))).toEqual([
      ['Parent'],
      ['Parent/SubA'],
      ['Parent/SubA/SubB'],
    ]);
    const byName = (n: string) =>
      plan.files.find((f) => (f.file as unknown as { name: string }).name === n)?.dirPath;
    expect(byName('file1')).toBe('Parent');
    expect(byName('file2')).toBe('Parent/SubA');
    expect(byName('file3')).toBe('Parent/SubA/SubB');
  });
});
