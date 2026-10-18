type AssetDividendRow = {
  id: number;
  symbol: string;
  percentReturn: number;
};

type InvestmentDividendLink = {
  newSymbol: string;
  newPercent?: number;
};

function normalizeAssetSymbol(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function synchronizeDuplicateAssetDividends<T extends AssetDividendRow>(assets: T[], editedAssetId: number, dividendRate: number) {
  const editedAsset = assets.find((asset) => asset.id === editedAssetId);
  if (!editedAsset) return assets;
  const symbolKey = normalizeAssetSymbol(editedAsset.symbol);
  return assets.map((asset) => (
    asset.id === editedAssetId || (symbolKey && normalizeAssetSymbol(asset.symbol) === symbolKey)
      ? { ...asset, percentReturn: dividendRate }
      : asset
  ));
}

export function synchronizeInvestmentWhatIfDividends<T extends InvestmentDividendLink>(investments: T[], assetSymbol: string, dividendRate: number) {
  const symbolKey = normalizeAssetSymbol(assetSymbol);
  if (!symbolKey) return investments;
  return investments.map((investment) => (
    normalizeAssetSymbol(investment.newSymbol) === symbolKey
      ? { ...investment, newPercent: dividendRate }
      : investment
  ));
}
