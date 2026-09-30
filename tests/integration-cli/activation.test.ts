import * as vscode from 'vscode';
let expect: Chai.ExpectStatic;

before(async () => {
  ({ expect } = await import('chai'));
});

describe('Integration CLI: activation', () => {
  it('activates the extension successfully', async () => {
    const extension = vscode.extensions.getExtension('bluecloud-dev.muninn-vscode');
    expect(extension).to.not.equal(undefined);

    await extension?.activate();
    expect(extension?.isActive).to.equal(true);
  });
});
