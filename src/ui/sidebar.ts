import { BaseComponent } from './component';
import { WorkspaceTree } from './workspace_tree';

export class Sidebar extends BaseComponent {
  private readonly content: HTMLDivElement;
  private readonly toggleButton: HTMLButtonElement;
  private readonly workspaceTree: WorkspaceTree;
  private isOpen = true;
  private width = 200;

  constructor() {
    super('aside', ['flex', 'flex-col', 'border-r', 'border-base-300', 'bg-base-200', 'h-full', 'shrink-0', 'transition-all']);
    this.element.style.width = `${this.width}px`;

    this.content = document.createElement('div');
    this.content.className = 'flex-1 overflow-auto p-3';

    this.workspaceTree = new WorkspaceTree();

    this.toggleButton = document.createElement('button');
    this.toggleButton.className = 'btn btn-ghost btn-sm m-2 relative z-10';
    this.toggleButton.style.marginLeft = '150px';
    this.toggleButton.style.marginRight = '0';
    this.toggleButton.style.flexShrink = '0';
    this.toggleButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><path d="M3 6.75A.75.75 0 0 1 3.75 6h16.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 6.75Zm0 5.25a.75.75 0 0 1 .75-.75h16.5a.75.75 0 0 1 0 1.5H3.75a.75.75 0 0 1-.75-.75Zm0 5.25A.75.75 0 0 1 3.75 16h16.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 17.25Z"/></svg>';
    this.toggleButton.title = 'Toggle workspace sidebar';
    this.toggleButton.addEventListener('click', () => this.toggle());

    this.element.append(this.toggleButton, this.content);
  }

  mount(parent: HTMLElement): this {
    parent.appendChild(this.element);
    return this;
  }

  setWorkspace(path: string | null): void {
    this.content.replaceChildren();
    if (!path) {
      this.renderEmptyState();
      return;
    }

    const title = document.createElement('div');
    title.className = 'text-xs uppercase tracking-wide opacity-70';
    title.textContent = 'Workspace';

    this.content.append(title, this.workspaceTree.element);
    this.workspaceTree.setWorkspace(path);
  }

  attachToTitleBar(titleBar: HTMLElement): void {
    titleBar.prepend(this.toggleButton);
  }

  getWidth(): number {
    return this.width;
  }

  setWidth(width: number): void {
    this.width = Math.min(420, Math.max(180, width));
    this.element.style.width = `${this.width}px`;
  }

  private toggle(): void {
    this.isOpen = !this.isOpen;
    this.element.classList.toggle('hidden', !this.isOpen);
    this.element.style.width = this.isOpen ? `${this.width}px` : '0px';
    this.toggleButton.classList.toggle('btn-active', !this.isOpen);
  }

  private renderEmptyState(): void {
    const empty = document.createElement('div');
    empty.className = 'text-sm opacity-70';
    empty.textContent = 'Open a folder to view the workspace structure.';
    this.content.appendChild(empty);
  }

}
