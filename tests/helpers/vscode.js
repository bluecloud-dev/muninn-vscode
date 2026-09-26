const fs = require('fs').promises;

const { URI: Uri, Utils } = require('vscode-uri');
Uri.joinPath = (uri, ...segments) => Utils.joinPath(uri, ...segments);

class Position {
  constructor(line, character) {
    this.line = line;
    this.character = character;
  }

  translate(lineDelta = 0, characterDelta = 0) {
    return new Position(this.line + lineDelta, this.character + characterDelta);
  }
}

class Range {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }
}

class WorkspaceEdit {
  constructor() {
    this.replacements = [];
  }

  createFile(uri, options) {
    this.creation = { uri, options };
  }

  replace(uri, range, text) {
    this.replacements.push({ uri, range, text });
  }
}

class Selection extends Range {
  constructor(anchor, active) {
    super(anchor, active);
    this.anchor = anchor;
    this.active = active;
  }

  get isEmpty() {
    return this.anchor.line === this.active.line && this.anchor.character === this.active.character;
  }
}

const workspaceFs = {
  stat: async (uri) => {
    const stats = await fs.stat(uri.fsPath);
    return { size: stats.size };
  },
  readFile: async (uri) => fs.readFile(uri.fsPath),
  createDirectory: async (uri) => fs.mkdir(uri.fsPath, { recursive: true }),
  writeFile: async (uri, bytes) => fs.writeFile(uri.fsPath, bytes),
  delete: async (uri) => fs.rm(uri.fsPath),
};

const workspace = {
  fs: workspaceFs,
  applyEdit: async () => true,
  openTextDocument: async () => undefined,
  getConfiguration: () => ({
    get: () => undefined,
    inspect: () => undefined,
    update: async () => undefined,
  }),
  asRelativePath: (uri) => uri.fsPath,
  workspaceFolders: [],
  workspaceFile: undefined,
  textDocuments: [],
  onDidOpenTextDocument: () => ({ dispose: () => {} }),
  onDidCloseTextDocument: () => ({ dispose: () => {} }),
  onDidDeleteFiles: () => ({ dispose: () => {} }),
  onDidChangeConfiguration: () => ({ dispose: () => {} }),
  onDidChangeTextDocument: () => ({ dispose: () => {} }),
  onDidGrantWorkspaceTrust: () => ({ dispose: () => {} }),
  onWillSaveTextDocument: () => ({ dispose: () => {} }),
};

const window = {
  showInformationMessage: async () => undefined,
  showWarningMessage: async () => undefined,
  showErrorMessage: async () => undefined,
  showInputBox: async () => undefined,
  showOpenDialog: async () => undefined,
  showSaveDialog: async () => undefined,
  showQuickPick: async () => undefined,
  showTextDocument: async () => undefined,
  setStatusBarMessage: () => undefined,
  createOutputChannel: () => ({
    appendLine: () => {},
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    show: () => {},
    clear: () => {},
    dispose: () => {},
  }),
  createTextEditorDecorationType: () => ({
    dispose: () => {},
  }),
  activeTextEditor: undefined,
  visibleTextEditors: [],
  onDidChangeActiveTextEditor: () => ({ dispose: () => {} }),
  registerCustomEditorProvider: () => ({ dispose: () => {} }),
  tabGroups: {
    onDidChangeTabs: () => ({ dispose: () => {} }),
    onDidChangeTabGroups: () => ({ dispose: () => {} }),
    all: [],
    activeTabGroup: {
      isActive: true,
      viewColumn: 1,
      activeTab: undefined,
      tabs: [],
    },
    close: async () => true,
  },
};

const env = {
  language: 'en',
  openExternal: async () => undefined,
};

const commands = {
  executeCommand: async () => undefined,
  registerCommand: () => ({ dispose: () => {} }),
  registerTextEditorCommand: () => ({ dispose: () => {} }),
};

const l10n = {
  t: (message, ...values) => {
    if (values.length === 0) {
      return message;
    }
    return message.replace(/\{(\d+)\}/g, (_, index) => String(values[index] ?? ''));
  },
};

class TabInputText {
  constructor(uri) {
    this.uri = uri;
  }
}

class TabInputCustom {
  constructor(uri, viewType) {
    this.uri = uri;
    this.viewType = viewType;
  }
}

class TabInputTextDiff {
  constructor(original, modified) {
    this.original = original;
    this.modified = modified;
  }
}

const ViewColumn = {
  One: 1,
  Two: 2,
  Three: 3,
};

const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3,
};

module.exports = {
  Uri,
  Position,
  Range,
  WorkspaceEdit,
  Selection,
  ViewColumn,
  ConfigurationTarget,
  window,
  workspace,
  commands,
  env,
  l10n,
  TabInputText,
  TabInputCustom,
  TabInputTextDiff,
};
