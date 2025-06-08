export type ArchiveConfig = {
  dateRange: {
    days: number;
    description: string;
  };
};

export const defaultConfig: ArchiveConfig = {
  dateRange: {
    days: 14,
    description: "past two weeks",
  },
};

// Example configurations for different user types
export const archiveConfigs: Record<string, ArchiveConfig> = {
  default: defaultConfig,
  dj: {
    dateRange: {
      days: 90,
      description: "past three months",
    },
  },
};

// Helper function to get date range
export function getDateRange(config: ArchiveConfig) {
  const today = new Date();
  const startDate = new Date();
  startDate.setDate(today.getDate() - config.dateRange.days);
  return { today, startDate };
}
