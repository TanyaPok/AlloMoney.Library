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

    it('formats values using the data currency (A3)', async () => {
      await setup();
      fixture.componentRef.setInput('dataSource', { ...REFERENCE_DATA, currency: 'USD' });
      fixture.detectChanges();
      const values = Array.from(
        el().querySelectorAll('.allomoney-sankey__node-value'),
      ).map((n) => n.textContent!);
      expect(values.every((v) => /10[.,]00/.test(v))).toBe(true);
      expect(values.some((v) => v !== '10.00')).toBe(true); // currency symbol added
    });

    it('renders a portrait viewBox when orientation is vertical (A2)', async () => {
      await setup();
      fixture.componentRef.setInput('dataSource', { ...REFERENCE_DATA, orientation: 'vertical' });
      fixture.detectChanges();
      const [, , w, h] = el()
        .querySelector('svg')!
        .getAttribute('viewBox')!
        .split(' ')
        .map(Number);
      expect(h).toBeGreaterThan(w); // taller than wide
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

  describe('hover highlighting (UC-2)', () => {
    const dim = (): NodeListOf<Element> =>
      el().querySelectorAll('.allomoney-sankey--dim');
    const dimmedNodes = (): NodeListOf<Element> =>
      el().querySelectorAll('.allomoney-sankey__node.allomoney-sankey--dim');
    const dimmedLinks = (): NodeListOf<Element> =>
      el().querySelectorAll('.allomoney-sankey__link.allomoney-sankey--dim');

    // Reference links, in render order: 0-2, 0-3, 1-2, 2-4, 3-4.
    // Node groups render in input order: 0, 1, 2, 3, 4.

    it('dims the sibling flows when hovering a link, then restores on leave', async () => {
      await setup();
      fixture.componentRef.setInput('dataSource', REFERENCE_DATA);
      fixture.detectChanges();
      expect(dim()).toHaveLength(0); // nothing dimmed initially

      // Hover 1→2: chain is {1,2,4} + {1-2,2-4}; siblings 0 & 3 and their three
      // links dim.
      el().querySelectorAll('.allomoney-sankey__link')[2].dispatchEvent(
        new Event('pointerenter'),
      );
      fixture.detectChanges();
      expect(dimmedNodes()).toHaveLength(2); // nodes 0 and 3
      expect(dimmedLinks()).toHaveLength(3); // 0-2, 0-3, 3-4

      // Pointer leaves → the translucency is removed (main scenario step 4).
      el().querySelectorAll('.allomoney-sankey__link')[2].dispatchEvent(
        new Event('pointerleave'),
      );
      fixture.detectChanges();
      expect(dim()).toHaveLength(0);
    });

    it('lights a source node\'s whole descendant cone and dims the rest', async () => {
      await setup();
      fixture.componentRef.setInput('dataSource', REFERENCE_DATA);
      fixture.detectChanges();

      // Hover node 0: chain {0,2,3,4}; only node 1 and link 1-2 fall outside.
      el().querySelectorAll('.allomoney-sankey__node')[0].dispatchEvent(
        new Event('pointerenter'),
      );
      fixture.detectChanges();
      expect(dimmedNodes()).toHaveLength(1); // node 1
      expect(dimmedLinks()).toHaveLength(1); // link 1-2
    });

    it('dims nothing when the hovered element reaches the whole diagram (extension 1.a)', async () => {
      await setup();
      fixture.componentRef.setInput('dataSource', REFERENCE_DATA);
      fixture.detectChanges();

      // Node 4 is the shared sink — every flow reaches it, so nothing dims.
      el().querySelectorAll('.allomoney-sankey__node')[4].dispatchEvent(
        new Event('pointerenter'),
      );
      fixture.detectChanges();
      expect(dim()).toHaveLength(0);
    });
  });

  describe('invalid data (business rule 3)', () => {
    it('renders only the valid subset and logs rejected entries', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await setup();
      fixture.componentRef.setInput('dataSource', {
        nodes: [
          { id: 0, name: 'ok' },
          { id: Number.NaN, name: 'bad id' }, // non-finite id -> node rejected
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

    it('renders an untrusted node name as escaped text, not live markup', async () => {
      await setup();
      fixture.componentRef.setInput('dataSource', {
        nodes: [
          { id: 0, name: '<script>alert(1)</script>' },
          { id: 1, name: 'ok' },
        ],
        links: [{ source: 0, target: 1, value: 5 }],
      } as SankeyData);
      fixture.detectChanges();
      const labels = Array.from(
        el().querySelectorAll('.allomoney-sankey__node-label'),
      ).map((n) => n.textContent);
      expect(labels).toContain('<script>alert(1)</script>');
      // The markup is inert: no real <script> element was injected.
      expect(el().querySelector('script')).toBeNull();
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
