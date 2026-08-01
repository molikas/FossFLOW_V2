import { Model } from 'src/types';
import { modelItems } from './modelItems';
import { views } from './views';
import { colors } from './colors';

export const model: Model = {
  version: '1.0.0',
  title: 'TestModel',
  description: 'TestModelDescription',
  colors,
  // ADR 0003 addendum (2026-08-01): the bundled icon catalog is HOST data and
  // no longer has a lib-side module. This test fixture models a diagram with no
  // icons, which is what the retired `fixtures/icons` exported anyway ([]).
  icons: [],
  items: modelItems,
  views
} as const;
