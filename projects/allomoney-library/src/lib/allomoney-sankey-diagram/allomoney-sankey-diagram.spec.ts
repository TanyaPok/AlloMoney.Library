import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AllomoneySankeyDiagram } from './allomoney-sankey-diagram';
import type { SankeyData } from './models/sankey-data';

/** The UC-1 reference payload from REQUIREMENTS.md. */
const REFERENCE_DATA: SankeyData = {
  nodes: [
    { id: 0, name: 'account 0', value: 10.0 },
    { id: 1, name: 'node 1' },
    { id: 2 },
    { id: 3, name: 'Invest node 3', value: 10.0 },
    { id: 4, name: 'Questrade ARTG' },
  ],
  links: [
    { source: 0, target: 2, value: 5.5 },
    { source: 0, target: 3, value: 4.5 },
    { source: 1, target: 2, value: 0.5 },
    { source: 2, target: 4, value: 6.0 },
    { source: 3, target: 4, value: 5.0 },
  ],
};

describe('AllomoneySankeyDiagram', () => {
  let fixture: ComponentFixture<AllomoneySankeyDiagram>;
  let component: AllomoneySankeyDiagram;

  async function setup(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [AllomoneySankeyDiagram],
    }).compileComponents();
    fixture = TestBed.createComponent(AllomoneySankeyDiagram);
    component = fixture.componentInstance;
  }

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates', async () => {
    await setup();
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  describe('empty state (business rules 4 & 5)', () => {
    it('shows the placeholder when no data is supplied', async () => {
      await setup();
      fixture.detectChanges();
      expect(component.isEmpty()).toBe(true);
      expect(el().querySelector('.allomoney-sankey__empty')).not.toBeNull();
      expect(el().querySelector('.allomoney-sankey__canvas')).toBeNull();
    });

    it('shows the placeholder for an empty-nodes payload', async () => {
      await setup();
      fixture.componentRef.setInput('dataSource', { nodes: [], links: [] } as SankeyData);
      fixture.detectChanges();
      expect(component.isEmpty()).toBe(true);
    });

    it('exposes the empty message as real text for assistive tech', async () => {
      await setup();
      fixture.detectChanges();
      const empty = el().querySelector('.allomoney-sankey__empty');
      expect(empty?.getAttribute('aria-label')?.trim().length).toBeGreaterThan(0);
    });
  });

  describe('theme (business rule 1)', () => {
    it('defaults the theme to light', async () => {
      await setup();
      fixture.detectChanges();
      expect(component.theme()).toBe('light');
      expect(el().getAttribute('data-theme')).toBe('light');
    });

    it('reflects the theme input onto the host', async () => {
      await setup();
      fixture.componentRef.setInput('theme', 'dark');
      fixture.detectChanges();
      expect(el().getAttribute('data-theme')).toBe('dark');
    });
  });

  describe('rendering the diagram (business rule 2)', () => {
    it('draws one rect per node and one ribbon per link', async () => {
      await setup();
      fixture.componentRef.setInput('dataSource', REFERENCE_DATA);
      fixture.detectChanges();
      expect(component.isEmpty()).toBe(false);
      expect(el().querySelectorAll('.allomoney-sankey__node-rect')).toHaveLength(5);
      expect(el().querySelectorAll('.allomoney-sankey__link')).toHaveLength(5);
    });

    it('renders node names and derives a label for the unnamed node', async () => {
      await setup();
      fixture.componentRef.setInput('dataSource', REFERENCE_DATA);
      fixture.detectChanges();
      const labels = Array.from(
        el().querySelectorAll('.allomoney-sankey__node-label'),
      ).map((n) => n.textContent);
      expect(labels).toContain('account 0');
      expect(labels).toContain('Questrade ARTG');
      expect(labels).toContain('2'); // unnamed node falls back to its id
    });

    it('shows in-node values only for explicitly-valued nodes', async () => {
      await setup();
      fixture.componentRef.setInput('dataSource', REFERENCE_DATA);
      fixture.detectChanges();
      const values = Array.from(
        el().querySelectorAll('.allomoney-sankey__node-value'),
      ).map((n) => n.textContent);
      expect(values).toEqual(['10.00', '10.00']);
    });
  });

  describe('accessibility', () => {
    it('exposes an accessible svg with a title, desc, and text alternative', async () => {
      await setup();
      fixture.componentRef.setInput('dataSource', REFERENCE_DATA);
      fixture.detectChanges();
      const svg = el().querySelector('svg')!;
      expect(svg.getAttribute('role')).toBe('img');
      const labelledby = svg.getAttribute('aria-labelledby') ?? '';
      expect(svg.querySelector('title')?.getAttribute('id')).toBe(labelledby.split(' ')[0]);
      expect(svg.querySelector('desc')).not.toBeNull();
      const items = el().querySelectorAll('.allomoney-sankey__sr-only li');
      expect(items).toHaveLength(5);
      expect(items[0].textContent).toMatch(/→.*:/);
    });
  });

  describe('invalid data (business rule 3)', () => {
    it('renders only the valid subset and logs rejected entries', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await setup();
      fixture.componentRef.setInput('dataSource', {
        nodes: [
          { id: 0, name: 'ok' },
          { id: 1, name: '<script>alert(1)</script>' },
        ],
        links: [
          { source: 0, target: 1, value: 5 }, // target rejected -> link dropped
          { source: 0, target: 0, value: 5 }, // self-loop dropped
        ],
      } as SankeyData);
      fixture.detectChanges();
      expect(el().querySelectorAll('.allomoney-sankey__node-rect')).toHaveLength(1);
      expect(el().querySelectorAll('.allomoney-sankey__link')).toHaveLength(0);
      expect(spy).toHaveBeenCalled();
    });

    it('falls back to the placeholder when every node is invalid', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await setup();
      fixture.componentRef.setInput('dataSource', {
        nodes: [{ id: 'x' as unknown as number }],
        links: [],
      } as SankeyData);
      fixture.detectChanges();
      expect(component.isEmpty()).toBe(true);
      expect(el().querySelector('.allomoney-sankey__empty')).not.toBeNull();
    });
  });
});
