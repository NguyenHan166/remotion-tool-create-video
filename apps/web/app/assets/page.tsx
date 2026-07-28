import { type Metadata } from 'next';
import { AssetLibrary } from './asset-library';

export const metadata: Metadata = {
  title: 'Thư viện media',
};

export default function AssetsPage() {
  return <AssetLibrary />;
}
