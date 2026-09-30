import * as vscode from 'vscode';
let expect: Chai.ExpectStatic;

before(async () => {
  ({ expect } = await import('chai'));
});

describe('Integration CLI: command registration', () => {
  it('registers key Muninn commands', async () => {
    const extension = vscode.extensions.getExtension('blueclouddev.muninn-vscode');
    expect(extension).to.not.equal(undefined);
    await extension?.activate();

    const commands = await vscode.commands.getCommands(true);

    expect(commands).to.include('muninn.openRawMarkdown');
    expect(commands).to.include('muninn.toggleBold');
    expect(commands).to.include('muninn.toggleItalic');
    expect(commands).to.include('muninn.setHeading1');
    expect(commands).to.include('muninn.setHeading2');
    expect(commands).to.include('muninn.setHeading3');
    expect(commands).to.include('muninn.setParagraph');
    expect(commands).to.include('muninn.toggleBulletList');
    expect(commands).to.include('muninn.toggleNumberedList');
    expect(commands).to.include('muninn.insertLink');
    expect(commands).to.include('muninn.insertMermaidBlock');
    expect(commands).to.include('muninn.insertTable');
    expect(commands).to.include('muninn.insertCodeBlock');
    expect(commands).to.include('muninn.insertImage');
    expect(commands).to.include('muninn.addTableRow');
    expect(commands).to.include('muninn.addTableColumn');
    expect(commands).to.include('muninn.tableActions');
    expect(commands).to.include('muninn.inspectConfiguration');
  });
});
