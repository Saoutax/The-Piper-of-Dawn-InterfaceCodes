interface DiffChange {
    value: string;
    added?: boolean;
    removed?: boolean;
}

interface DiffStatic {
    diffChars(oldStr: string, newStr: string): DiffChange[];
    diffWords(oldStr: string, newStr: string): DiffChange[];
    diffLines(oldStr: string, newStr: string): DiffChange[];
}

interface Window {
    Diff: DiffStatic;
}
