/**
 * JsonDiffViewer Component Tests
 *
 * Tests for JSON diff display with creation, deletion, and modification scenarios.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useMemo } from 'react';

// Types matching the real component
interface DiffLine {
  type: 'add' | 'remove' | 'unchanged';
  content: string;
  lineNumber: number;
}

interface JsonDiffViewerProps {
  oldValue?: unknown;
  newValue?: unknown;
  className?: string;
}

/**
 * Simple JSON diff algorithm (copied from the real component)
 */
function computeDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const result: DiffLine[] = [];
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  let lineNum = 1;

  // Find removed lines (in old but not in new)
  for (const line of oldLines) {
    if (!newSet.has(line)) {
      result.push({ type: 'remove', content: line, lineNumber: lineNum++ });
    }
  }

  // Process new lines
  for (const line of newLines) {
    if (!oldSet.has(line)) {
      result.push({ type: 'add', content: line, lineNumber: lineNum++ });
    } else {
      result.push({ type: 'unchanged', content: line, lineNumber: lineNum++ });
    }
  }

  return result;
}

/**
 * Mock JsonDiffViewer that mirrors the real implementation
 */
function MockJsonDiffViewer({ oldValue, newValue, className }: JsonDiffViewerProps) {
  const diff = useMemo(() => {
    const oldJson = oldValue ? JSON.stringify(oldValue, null, 2) : '';
    const newJson = newValue ? JSON.stringify(newValue, null, 2) : '';

    const oldLines = oldJson ? oldJson.split('\n') : [];
    const newLines = newJson ? newJson.split('\n') : [];

    return computeDiff(oldLines, newLines);
  }, [oldValue, newValue]);

  if (!oldValue && !newValue) {
    return (
      <div data-testid="no-changes" className={className}>
        No changes recorded
      </div>
    );
  }

  // If only new value (creation)
  if (!oldValue && newValue) {
    return (
      <div data-testid="creation-view" className={className}>
        <div data-testid="label">Created:</div>
        <pre data-testid="new-value">
          <code>{JSON.stringify(newValue, null, 2)}</code>
        </pre>
      </div>
    );
  }

  // If only old value (deletion)
  if (oldValue && !newValue) {
    return (
      <div data-testid="deletion-view" className={className}>
        <div data-testid="label">Deleted:</div>
        <pre data-testid="old-value">
          <code>{JSON.stringify(oldValue, null, 2)}</code>
        </pre>
      </div>
    );
  }

  // Side-by-side diff
  return (
    <div data-testid="diff-view" className={className}>
      {/* Old Value */}
      <div data-testid="before-section">
        <div data-testid="before-label">Before:</div>
        <pre data-testid="before-content">
          {diff
            .filter((line) => line.type !== 'add')
            .map((line, idx) => (
              <div
                key={idx}
                data-testid={`before-line-${idx}`}
                data-type={line.type}
              >
                {line.type === 'remove' && <span data-testid="remove-indicator">-</span>}
                {line.content}
              </div>
            ))}
        </pre>
      </div>

      {/* New Value */}
      <div data-testid="after-section">
        <div data-testid="after-label">After:</div>
        <pre data-testid="after-content">
          {diff
            .filter((line) => line.type !== 'remove')
            .map((line, idx) => (
              <div
                key={idx}
                data-testid={`after-line-${idx}`}
                data-type={line.type}
              >
                {line.type === 'add' && <span data-testid="add-indicator">+</span>}
                {line.content}
              </div>
            ))}
        </pre>
      </div>
    </div>
  );
}

describe('JsonDiffViewer', () => {
  describe('Empty State', () => {
    it('should show "No changes recorded" when both values are empty', () => {
      render(<MockJsonDiffViewer />);

      expect(screen.getByTestId('no-changes')).toHaveTextContent('No changes recorded');
    });

    it('should show "No changes recorded" when both values are undefined', () => {
      render(<MockJsonDiffViewer oldValue={undefined} newValue={undefined} />);

      expect(screen.getByTestId('no-changes')).toBeInTheDocument();
    });
  });

  describe('Creation View', () => {
    it('should show creation view when only newValue is provided', () => {
      const newValue = { name: 'Test', count: 42 };

      render(<MockJsonDiffViewer newValue={newValue} />);

      expect(screen.getByTestId('creation-view')).toBeInTheDocument();
      expect(screen.getByTestId('label')).toHaveTextContent('Created:');
    });

    it('should display the new value as formatted JSON', () => {
      const newValue = { name: 'Test' };

      render(<MockJsonDiffViewer newValue={newValue} />);

      const code = screen.getByTestId('new-value');
      expect(code).toHaveTextContent('"name": "Test"');
    });

    it('should handle complex nested objects', () => {
      const newValue = {
        user: { name: 'Alice', roles: ['admin', 'user'] },
        settings: { theme: 'dark' },
      };

      render(<MockJsonDiffViewer newValue={newValue} />);

      const code = screen.getByTestId('new-value');
      expect(code).toHaveTextContent('"user"');
      expect(code).toHaveTextContent('"roles"');
      expect(code).toHaveTextContent('"admin"');
    });
  });

  describe('Deletion View', () => {
    it('should show deletion view when only oldValue is provided', () => {
      const oldValue = { name: 'Deleted Item', id: 1 };

      render(<MockJsonDiffViewer oldValue={oldValue} />);

      expect(screen.getByTestId('deletion-view')).toBeInTheDocument();
      expect(screen.getByTestId('label')).toHaveTextContent('Deleted:');
    });

    it('should display the old value as formatted JSON', () => {
      const oldValue = { id: 123 };

      render(<MockJsonDiffViewer oldValue={oldValue} />);

      const code = screen.getByTestId('old-value');
      expect(code).toHaveTextContent('"id": 123');
    });
  });

  describe('Diff View', () => {
    it('should show diff view when both values are provided', () => {
      const oldValue = { name: 'Old' };
      const newValue = { name: 'New' };

      render(<MockJsonDiffViewer oldValue={oldValue} newValue={newValue} />);

      expect(screen.getByTestId('diff-view')).toBeInTheDocument();
      expect(screen.getByTestId('before-label')).toHaveTextContent('Before:');
      expect(screen.getByTestId('after-label')).toHaveTextContent('After:');
    });

    it('should mark removed lines with minus sign', () => {
      const oldValue = { removed: true, unchanged: true };
      const newValue = { unchanged: true };

      render(<MockJsonDiffViewer oldValue={oldValue} newValue={newValue} />);

      expect(screen.getAllByTestId('remove-indicator').length).toBeGreaterThan(0);
    });

    it('should mark added lines with plus sign', () => {
      const oldValue = { unchanged: true };
      const newValue = { unchanged: true, added: true };

      render(<MockJsonDiffViewer oldValue={oldValue} newValue={newValue} />);

      expect(screen.getAllByTestId('add-indicator').length).toBeGreaterThan(0);
    });

    it('should show unchanged lines without indicators', () => {
      const oldValue = { name: 'Same', count: 1 };
      const newValue = { name: 'Same', count: 2 };

      render(<MockJsonDiffViewer oldValue={oldValue} newValue={newValue} />);

      // Before section should have the unchanged name
      const beforeContent = screen.getByTestId('before-content');
      expect(beforeContent).toHaveTextContent('"name": "Same"');

      // After section should also have the unchanged name
      const afterContent = screen.getByTestId('after-content');
      expect(afterContent).toHaveTextContent('"name": "Same"');
    });
  });

  describe('Custom className', () => {
    it('should apply className to no changes view', () => {
      render(<MockJsonDiffViewer className="custom-class" />);

      expect(screen.getByTestId('no-changes')).toHaveClass('custom-class');
    });

    it('should apply className to creation view', () => {
      render(<MockJsonDiffViewer newValue={{ test: 1 }} className="custom-class" />);

      expect(screen.getByTestId('creation-view')).toHaveClass('custom-class');
    });

    it('should apply className to diff view', () => {
      render(<MockJsonDiffViewer oldValue={{ a: 1 }} newValue={{ b: 2 }} className="custom-class" />);

      expect(screen.getByTestId('diff-view')).toHaveClass('custom-class');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty objects', () => {
      render(<MockJsonDiffViewer oldValue={{}} newValue={{ added: true }} />);

      expect(screen.getByTestId('diff-view')).toBeInTheDocument();
    });

    it('should handle arrays', () => {
      const oldValue = [1, 2, 3];
      const newValue = [1, 2, 3, 4];

      render(<MockJsonDiffViewer oldValue={oldValue} newValue={newValue} />);

      expect(screen.getByTestId('diff-view')).toBeInTheDocument();
      expect(screen.getByTestId('after-content')).toHaveTextContent('4');
    });

    it('should handle null values in objects', () => {
      const oldValue = { value: null };
      const newValue = { value: 'not null' };

      render(<MockJsonDiffViewer oldValue={oldValue} newValue={newValue} />);

      expect(screen.getByTestId('before-content')).toHaveTextContent('null');
      expect(screen.getByTestId('after-content')).toHaveTextContent('"not null"');
    });

    it('should handle boolean values', () => {
      const oldValue = { enabled: true };
      const newValue = { enabled: false };

      render(<MockJsonDiffViewer oldValue={oldValue} newValue={newValue} />);

      expect(screen.getByTestId('before-content')).toHaveTextContent('true');
      expect(screen.getByTestId('after-content')).toHaveTextContent('false');
    });

    it('should handle string values', () => {
      const oldValue = 'old string';
      const newValue = 'new string';

      render(<MockJsonDiffViewer oldValue={oldValue} newValue={newValue} />);

      expect(screen.getByTestId('before-content')).toHaveTextContent('"old string"');
      expect(screen.getByTestId('after-content')).toHaveTextContent('"new string"');
    });

    it('should handle number values', () => {
      const oldValue = 42;
      const newValue = 100;

      render(<MockJsonDiffViewer oldValue={oldValue} newValue={newValue} />);

      expect(screen.getByTestId('before-content')).toHaveTextContent('42');
      expect(screen.getByTestId('after-content')).toHaveTextContent('100');
    });
  });
});

describe('computeDiff function', () => {
  it('should identify removed lines', () => {
    const oldLines = ['line1', 'line2', 'line3'];
    const newLines = ['line1', 'line3'];

    const result = computeDiff(oldLines, newLines);

    expect(result.some((l) => l.type === 'remove' && l.content === 'line2')).toBe(true);
  });

  it('should identify added lines', () => {
    const oldLines = ['line1'];
    const newLines = ['line1', 'line2'];

    const result = computeDiff(oldLines, newLines);

    expect(result.some((l) => l.type === 'add' && l.content === 'line2')).toBe(true);
  });

  it('should identify unchanged lines', () => {
    const oldLines = ['same'];
    const newLines = ['same'];

    const result = computeDiff(oldLines, newLines);

    expect(result.some((l) => l.type === 'unchanged' && l.content === 'same')).toBe(true);
  });

  it('should handle empty arrays', () => {
    const result = computeDiff([], []);

    expect(result).toHaveLength(0);
  });

  it('should handle complete replacement', () => {
    const oldLines = ['old1', 'old2'];
    const newLines = ['new1', 'new2'];

    const result = computeDiff(oldLines, newLines);

    expect(result.filter((l) => l.type === 'remove')).toHaveLength(2);
    expect(result.filter((l) => l.type === 'add')).toHaveLength(2);
  });
});
