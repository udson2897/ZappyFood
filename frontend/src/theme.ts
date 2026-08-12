export const colors = {
  surface: '#FFFFFF',
  onSurface: '#1A1817',
  surfaceSecondary: '#F8F8F6',
  onSurfaceSecondary: '#4A4A4A',
  surfaceTertiary: '#EFEFEA',
  onSurfaceTertiary: '#6B6B6B',
  surfaceInverse: '#1A1817',
  onSurfaceInverse: '#FFFFFF',
  brand: '#FF5A00',
  brandPrimary: '#FF5A00',
  onBrandPrimary: '#FFFFFF',
  brandSecondary: '#FFECE3',
  onBrandSecondary: '#D84C00',
  brandTertiary: '#FFF5F0',
  onBrandTertiary: '#FF5A00',
  success: '#28A745',
  warning: '#FFB800',
  error: '#DC3545',
  info: '#17A2B8',
  border: '#EBEBEB',
  borderStrong: '#D6D6D6',
  divider: '#F0F0F0',
};

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48,
};

export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };

export const font = {
  size: { sm: 12, base: 14, lg: 16, xl: 20, xxl: 24, huge: 32 },
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
};

export const STATUS_LABELS: Record<string, string> = {
  AGUARDANDO_CONFIRMACAO: 'Aguardando confirmação',
  ACEITO: 'Aceito',
  EM_PREPARO: 'Em preparo',
  SAIU_PARA_ENTREGA: 'Saiu para entrega',
  FINALIZADO: 'Finalizado',
  CANCELADO: 'Cancelado',
};

export const STATUS_COLORS: Record<string, string> = {
  AGUARDANDO_CONFIRMACAO: colors.warning,
  ACEITO: colors.info,
  EM_PREPARO: colors.warning,
  SAIU_PARA_ENTREGA: colors.brand,
  FINALIZADO: colors.success,
  CANCELADO: colors.error,
};

export const ORDER_FLOW = [
  'AGUARDANDO_CONFIRMACAO',
  'ACEITO',
  'EM_PREPARO',
  'SAIU_PARA_ENTREGA',
  'FINALIZADO',
];

export const brl = (v: number) =>
  `R$ ${v.toFixed(2).replace('.', ',')}`;
