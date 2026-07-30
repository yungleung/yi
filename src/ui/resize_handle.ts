import { BaseComponent } from './component';

export class ResizeHandle extends BaseComponent {
  private isDragging = false;
  private startX = 0;
  private startWidth = 0;
  private currentWidth = 0;

  constructor(
    private readonly onResize: (width: number) => void,
    private readonly minWidth: number = 180,
    private readonly maxWidth: number = 420,
    initialWidth: number = 288
  ) {
    super('div', [
      'cursor-col-resize',
      'bg-transparent',
      'transition-colors',
      'shrink-0',
      'select-none'
    ]);

    this.element.style.width = '10px';
    this.element.style.height = '100%';
    this.element.style.marginLeft = '-3px';
    this.element.style.opacity = '0';
    this.element.style.background = 'transparent';
    this.element.style.borderLeft = '0 solid transparent';
    this.element.style.pointerEvents = 'auto';
    this.currentWidth = initialWidth;
    this.element.addEventListener('mouseenter', () => this.show());
    this.element.addEventListener('mouseleave', () => this.hideIfNotDragging());
    this.element.addEventListener('mousedown', (event) => this.startDragging(event));
  }

  setVisible(visible: boolean): void {
    this.element.style.display = visible ? 'block' : 'none';
  }

  private show(): void {
    if (this.isDragging) return;
    this.element.classList.add('bg-base-300');
    this.element.style.opacity = '1';
    this.element.style.borderLeft = '3px solid rgba(59,130,246,0.35)';
  }

  private hideIfNotDragging(): void {
    if (this.isDragging) return;
    this.element.classList.remove('bg-base-300');
    this.element.classList.remove('bg-primary');
    this.element.style.opacity = '0';
    this.element.style.background = 'transparent';
    this.element.style.borderLeft = '0 solid transparent';
  }

  private startDragging(event: MouseEvent): void {
    event.preventDefault();
    this.isDragging = true;
    this.startX = event.clientX;
    this.startWidth = this.currentWidth || this.minWidth;

    this.element.classList.add('bg-primary');
    this.element.style.opacity = '1';
    this.element.style.borderLeft = '3px solid rgba(59,130,246,0.35)';
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
  }

  private readonly onMouseMove = (event: MouseEvent) => {
    if (!this.isDragging) return;

    const delta = event.clientX - this.startX;
    const nextWidth = this.clamp(this.startWidth + delta, this.minWidth, this.maxWidth);
    this.currentWidth = nextWidth;
    this.onResize(nextWidth);
  };

  private readonly onMouseUp = () => {
    this.isDragging = false;
    this.element.classList.remove('bg-primary');
    this.hideIfNotDragging();
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
  };

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}
