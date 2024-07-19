// @ts-check
import { join } from "path";
import { readFileSync } from "fs";
import express from "express";
import serveStatic from "serve-static";

import shopify from "./shopify.js";
import productCreator from "./product-creator.js";
import PrivacyWebhookHandlers from "./privacy.js";

const PORT = parseInt(
  process.env.BACKEND_PORT || process.env.PORT || "3000",
  10
);

const STATIC_PATH =
  process.env.NODE_ENV === "production"
    ? `${process.cwd()}/frontend/dist`
    : `${process.cwd()}/frontend/`;

const app = express();

// Set up Shopify authentication and webhook handling
app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  shopify.redirectToShopifyOrAppRoot()
);
app.post(
  shopify.config.webhooks.path,
  shopify.processWebhooks({ webhookHandlers: PrivacyWebhookHandlers })
);

// If you are adding routes outside of the /api path, remember to
// also add a proxy rule for them in web/frontend/vite.config.js

app.use("/api/*", shopify.validateAuthenticatedSession());

app.use(express.json());


// Create Product
app.post("/api/products", async (_req, res) => {
  let status = 200;
  let error = null;

  try {
    await productCreator(res.locals.shopify.session);
  } catch (e) {
    console.log(`Failed to process products/create: ${e.message}`);
    status = 500;
    error = e.message;
  }
  res.status(status).send({ success: status === 200, error });
});


// Read Shop Information 
app.get('/api/store/info', async(req, res) => {
  let shopInfo = await shopify.api.rest.Shop.all({
    session: res.locals.shopify.session,
  });

  res.status(200).send(shopInfo);
}); 


// Read Product Data
app.get("/api/products/allProducts", async (_req, res) => {
  const allProducts = await shopify.api.rest.Product.all({
    session: res.locals.shopify.session,
  });

  res.status(200).send(allProducts);
});


// Product Count
app.get("/api/products/count", async (_req, res) => {
  const countData = await shopify.api.rest.Product.count({
    session: res.locals.shopify.session,
  });
  res.status(200).send(countData);
});


// ready-to-ship -  end point 
// Get Paid and Unfulfilled Orders
app.get('/api/orders/ready-to-ship', async (req, res) => {
  try {
    // Retrieve the Orders
    const orders = await shopify.api.rest.Order.all({
      session: res.locals.shopify.session,
      status: 'any',
      financial_status: 'paid',
      fulfillment_status: 'unfulfilled',
    });
    const ordersData = orders.data;
    // console.log('ordersData :', ordersData)

    
    // Extract Variant IDs
    const productVariantIds = ordersData && ordersData?.flatMap(order => {
      return order.line_items?.map(lineItem => {
        return lineItem.variant_id;
        });
    });
    

    // Get Inventory Item IDs
    const inventoryItemData = await Promise.all(productVariantIds.map(async (variantId) => {
      try {
        const variant = await shopify.api.rest.Variant.find({
          session: res.locals.shopify.session,
          id: variantId,
        });        
        
        const inventoryItemId = variant?.inventory_item_id;
        return {
          variantId,
          inventoryItemId
        };
      } catch (error) {
        console.error(`Error fetching variant with ID ${variantId}:`, error.message);
        return {
          variantId,
          inventoryItemId: null
        };
      }
    })).then(ids => ids.filter(id => id !== null));

    const inventoryItemIds = inventoryItemData.filter(item => item.inventoryItemId !== null);


    // Retrieve Inventory Levels
    const inventoryLevels = await Promise.all(inventoryItemIds?.map(async ({variantId, inventoryItemId}) => {
      try {
        const inventoryLevelResponse = await shopify.api.rest.InventoryLevel.all({
          session: res.locals.shopify.session,
          inventory_item_ids: inventoryItemId,
        });
        const inventoryLevelsData = inventoryLevelResponse.data;
        // console.log('inventoryLevelsData :', inventoryLevelsData);
        
        // Sum available stock across all locations for the given inventory item
        const totalAvailable = inventoryLevelsData.reduce((total, level) => total + level.available, 0);

        return {
          variantId,
          inventoryItemId,
          available: totalAvailable,
          //   available: inventoryLevel[0].available,
        };
      } catch (error) {
        console.error(`Error fetching inventory level for item ID ${inventoryItemId}:`, error.message);
        return {
          variantId,
          inventoryItemId,
          available: null,
        };
      }
    }));


    // Extract Product IDs
    const productIds = ordersData?.flatMap(order => {
      return order.line_items?.map(lineItem => {
        return lineItem.product_id;
      });
    });
    const productIdsString = productIds.join(',');
    const productsResponse = await shopify.api.rest.Product.all({
      session: res.locals.shopify.session,
      ids: productIdsString,
    });
    const productsData = productsResponse.data;
    // console.log('productsData :', productsData);

    // Map product titles to product IDs
    const productTitleMap = productsData?.reduce((acc, product) => {
      acc[product.id] = product.title;
      return acc;
    }, {});
    
    // console.log('productTitleMap :', productTitleMap);

    const firstStockMap = {};
    const maxOnHandStockMap = {};

    // Construct the response data
    const responseData = ordersData?.map(order => {
      // console.log('order :', order);

      const lineItems = order.line_items?.map(lineItem => {

        // Find the corresponding inventory level data for the current line item variant_id
        const inventoryData = inventoryLevels.find(data => data.variantId === lineItem.variant_id);

        // Find the product title
        const productTitle = productTitleMap[lineItem.product_id];

        if (inventoryData) {
          const committed = lineItem.fulfillable_quantity;
          const available = inventoryData.available;
          // let onHand = 0;

          // Update the firstStockMap with available stock and cumulative committed stock
          if (firstStockMap[lineItem.variant_id] !== undefined) {
            firstStockMap[lineItem.variant_id].committed += committed;
          } else {
            firstStockMap[lineItem.variant_id] = {
              available: available,
              committed: committed,
              // onHand: onHand,
            };
          }

          const onHand = firstStockMap[lineItem.variant_id].committed + firstStockMap[lineItem.variant_id].available;
          
          // console.log('committed :', committed);
          // console.log('available :', available);
          // console.log('onHand :', onHand);


          return {
            product_title: productTitle,
            product_id: lineItem.product_id,
            variant_id: lineItem.variant_id,
            available_Stock: available,
            committed_Stock: committed,
            onHand_Stock: onHand,
          };
        } else {
          return {
            product_title: productTitle,
            product_id: lineItem.product_id,
            variant_id: lineItem.variant_id,
            available_Stock: 0, 
            committed_Stock: lineItem.fulfillable_quantity,
            onHand_Stock: lineItem.fulfillable_quantity,
          };
        }
      });

      // Determine the maximum onHand_Stock for each variant_id
      lineItems?.forEach(lineItem => {
        const currentOnHand = lineItem.onHand_Stock;
        if (!maxOnHandStockMap[lineItem.variant_id] || currentOnHand > maxOnHandStockMap[lineItem.variant_id]) {
          maxOnHandStockMap[lineItem.variant_id] = currentOnHand;
        }
      });

    // console.log('lineItems :', lineItems);

      return {
        orderId: order.id,
        orderNumber: order.name,
        orderDate: order.created_at,
        total_price: order.total_price,
        customer: order.customer,
        financial_status: order.financial_status,
        fulfillment_status: order.fulfillment_status,
        line_items: lineItems,
        maxOnHandStockMap: maxOnHandStockMap,
      };
    });
    // console.log('responseData :', responseData);


    res.status(200).send(responseData);
  } catch (e) {
    console.log(`Error fetching orders: ${e.message}`);
    res.status(500).send({ error: e.message });
  }
});



// // webhooks
// app.post('/webhooks/orders/create', (req, res) => {
//   const order = req.body;
//   // Handle new order
//   res.sendStatus(200);
// });

// // webhooks
// app.post('/webhooks/inventory_levels/update', (req, res) => {
//   const inventoryUpdate = req.body;
//   // Handle inventory update
//   res.sendStatus(200);
// });



// Get Assets Information 
// app.get('/api/assets/allAssets', async(req, res) => {
  
//   let assets = await shopify.api.rest.Asset.all({
//     session: res.locals.shopify.session,
//     theme_id: 167742439725,
//     asset: {"key": "sections/main-product.liquid"},
//     // asset: {"key": "templates/product.tab-template.json"},
//   });
  
//   res.status(200).send(assets);
// }); 


// Get Theme Information 
// app.get('/api/themes/allThemes', async(req, res) => {
//   let themeData = await shopify.api.rest.Theme.all({
//     session: res.locals.shopify.session,
//   });
  
//   res.status(200).send(themeData);
// }); 


app.use(shopify.cspHeaders());
app.use(serveStatic(STATIC_PATH, { index: false }));

app.use("/*", shopify.ensureInstalledOnShop(), async (_req, res, _next) => {
  return res
    .status(200)
    .set("Content-Type", "text/html")
    .send(readFileSync(join(STATIC_PATH, "index.html")));
});

app.listen(PORT);

