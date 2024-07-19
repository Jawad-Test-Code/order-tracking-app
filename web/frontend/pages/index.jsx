import { useEffect, useState } from "react";
import {
  LegacyCard,
  Page,
  Layout,
  Image,
  Link,
  Text,
  Box,
  HorizontalStack,
  Button,
  LegacyStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useTranslation, Trans } from "react-i18next";
import { trophyImage } from "../assets";
import { useAuthenticatedFetch } from "../hooks";
import { OrdersReadyToShip, ProductsCard } from "../components";


export default function HomePage() {
  const [storeDomain, setStoreDomain] = useState('');

  const { t } = useTranslation();
  let fetch = useAuthenticatedFetch();


  return (
    <Page narrowWidth>
      <TitleBar title={t("HomePage.title")} primaryAction={null} />

      <Layout >
        <Layout.Section>
          <div style={{ width: '71rem', marginLeft: '-20rem',}}>
            <OrdersReadyToShip />
          </div>
        </Layout.Section>
      </Layout>



      {/* <Layout style={{ marginTop:'10px' }} >
        <Layout.Section>
          <ProductsCard />
        </Layout.Section>
      </Layout> */}

    </Page>
  );
}
