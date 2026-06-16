export const HARVEST_DAYS: Record<string, number> = {
  Shangi: 90,
  "Dutch Robyjn": 120,
  "Kenya Karibu": 105,
  Tigoni: 110,
  Asante: 100,
  "Kenya Mpya": 100,
  Unica: 95,
  Markies: 110,
  Destiny: 105,
  Jelly: 110,
  Colomba: 90,
  Sagitta: 100,
  Sherekea: 105,
  Wanjiku: 100,
  "Purple Gold": 110,
  Challenger: 105,
};

const FALLBACK_HARVEST_DAYS = 100;

export type FarmerWithPlantingDate = {
  planting_date: string | null;
  potato_variety: string | null;
};

export type HarvestDateFilters = {
  harvest_date_from?: string | null;
  harvest_date_to?: string | null;
};

export const getEstimatedHarvestDate = (plantingDate: string | null, variety: string | null) => {
  if (!plantingDate) return null;

  const [year, month, day] = plantingDate.split("-").map(Number);
  if (!year || !month || !day) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;

  date.setUTCDate(date.getUTCDate() + (HARVEST_DAYS[variety || ""] || FALLBACK_HARVEST_DAYS));
  return date.toISOString().slice(0, 10);
};

export const withEstimatedHarvestDate = <T extends FarmerWithPlantingDate>(farmer: T) => ({
  ...farmer,
  estimated_harvest_date: getEstimatedHarvestDate(farmer.planting_date, farmer.potato_variety),
});

export const applyHarvestDateFilters = <T extends FarmerWithPlantingDate>(
  farmers: T[],
  filters: HarvestDateFilters,
) => farmers
  .map(withEstimatedHarvestDate)
  .filter((farmer) => {
    if (!filters.harvest_date_from && !filters.harvest_date_to) return true;
    if (!farmer.estimated_harvest_date) return false;
    if (filters.harvest_date_from && farmer.estimated_harvest_date < filters.harvest_date_from) return false;
    if (filters.harvest_date_to && farmer.estimated_harvest_date > filters.harvest_date_to) return false;
    return true;
  });
