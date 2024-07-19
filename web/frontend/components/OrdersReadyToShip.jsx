import React, { useEffect, useMemo, useState } from 'react';
import { Page, DataTable, LegacyCard, Button, Spinner } from '@shopify/polaris';
import { useAuthenticatedFetch } from '../hooks';

export function OrdersReadyToShip() {
    const [productData, setProductData] = useState([]);
    const [ordersData, setOrdersData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    let fetch = useAuthenticatedFetch();

    // Function to fetch all prodcuts
    async function fetchAllProducts() {
        try {
            setIsLoading(true);
            let request = await fetch("/api/products/allProducts", {
                method: "GET",
                headers: { "Content-Type": "application/json" },
            });
            let response = await request.json();
            const products = response.data;
            // console.log('Product Data :', products); 

            setProductData(products);
        } catch (error) {
            console.log('error while fetching orders-list: ', error);
            setError(error);
        } finally {
            setIsLoading(false);
        }
    }

    // Function to fetch all orders with Inventory Level
    async function fetchOrdersList() {
        try {
            setIsLoading(true);

            let request = await fetch("/api/orders/ready-to-ship", {
                method: "GET",
                headers: { "Content-Type": "application/json" },
            });
            let ordersData = await request.json();
            console.log('ordersData ----- :', ordersData);

            setOrdersData(ordersData);
        } catch (error) {
            console.log('error while fetching orders-list: ', error);
            setError(error);
        }
        finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        fetchAllProducts();
        fetchOrdersList();
    }, []);


    const handleRefresh = () => {
        fetchOrdersList();
    };

    console.log('ordersData  :', ordersData);
    const rows = useMemo(() => {
        return ordersData.flatMap(order => (
            order.line_items?.map(item => {
                // const fulfillmentStatus = order.fulfillment_status || 'Unfulfilled';
                return [
                    order.orderId,
                    order.orderNumber,
                    // item.product_title || 'Not Available',
                    order.customer && order.customer.first_name && order.customer.last_name
                        ? `${order.customer.first_name} ${order.customer.last_name}`
                        : 'No Customer',
                    `Rs ${order.total_price}`,
                    order.financial_status,
                    order.fulfillment_status || 'Unfulfilled',
                    // <div style={{ backgroundColor: fulfillmentStatus === 'Unfulfilled' ? '#ffeb78' : 'transparent' }}>
                    //     {fulfillmentStatus}
                    // </div>,
                    `${item.committed_Stock}  items`,
                    `${item.available_Stock || 0} in Stock`,
                ]
            })
        ));
    }, [ordersData]);

    return (
        <Page 
            title="Orders Ready to Ship"
            primaryAction={{ content: 'Refresh', onAction: handleRefresh }}
            fullWidth={true} 
        >
            <div style={{ position: 'relative' }}>
                {isLoading && (
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        zIndex: '9999',
                    }}>
                        <Spinner size="large" color="#007a5c" />
                    </div>
                )}
                <div style={{  filter: isLoading ? 'blur(4px)' : 'none' }}>
                    <LegacyCard style={{ marginBottom: '20px' }}>
                        <DataTable
                            rows={rows}
                            columnContentTypes={['numeric', 'text', 'text', 'text', 'text', 'text', 'text', 'numeric']}
                            headings={['Order ID', 'Order' ,'Customer', 'Total', 'Payment status', 'Fulfillment status', 'Items', 'Inventory Level']}
                            sortable={[false, true, true, true, false, false, true]}
                            hasZebraStripingOnData
                            hideScrollIndicator={true}
                            stickyHeader={true}
                            footerContent={`Showing ${rows.length} of ${rows.length} results`}
                            pagination={{
                                hasNext: true,
                                hasPrevious: true,
                                onNext: () => {},
                            }}
                        />
                    </LegacyCard>
                </div>
            </div>
        </Page>
    );
};

