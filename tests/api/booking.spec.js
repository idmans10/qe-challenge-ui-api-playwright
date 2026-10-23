import { test, expect, attachJson, attachResponse, persistenceComparison } from '../../src/fixtures/api.fixtures.js';
import { BookingFactory } from '../../src/api/factories/BookingFactory.js';

// Steps cover the test body only; fixture setup/teardown appear under "Before/After Hooks" in the report,
// and teardown attaches its own `cleanup-report`.
test.describe('Restful-Booker /booking', () => {
  test('API-01 creates a booking and persists it', async ({ bookingClient, bookingCleanup }) => {
    const payload = await test.step('Arrange: build booking payload', async (step) => {
      const payload = BookingFactory.build();
      await attachJson(step, 'booking-payload', payload);
      return payload;
    });

    const { createResponse, bookingId } = await test.step('Act: POST /booking', async (step) => {
      const createResponse = await bookingClient.create(payload);
      // Registered before any assertion, whatever the status, so a created booking is never left behind.
      const bookingId = await bookingCleanup.trackCreated(createResponse, payload);
      await attachResponse(step, 'POST /booking response', createResponse, { method: 'POST', ownedPayloads: [payload] });
      await attachJson(step, 'created-booking-id', { bookingId });
      return { createResponse, bookingId };
    });

    await test.step('Assert: POST returns the created booking', async () => {
      expect(createResponse.status(), 'POST /booking status').toBe(200);
      const created = await createResponse.json();
      expect(created.bookingid).toBe(bookingId);
      expect(created.bookingid).toBeGreaterThan(0);
      expect(created.booking).toEqual(payload);
      expect(bookingCleanup.has(bookingId)).toBe(true);
    });

    await test.step('Assert: GET /booking/:id returns the persisted booking', async (step) => {
      const getResponse = await bookingClient.get(bookingId);
      await attachResponse(step, 'GET /booking/:id response', getResponse, { method: 'GET', ownedPayloads: [payload] });
      expect(getResponse.status(), 'GET /booking/:id status').toBe(200);
      expect(await getResponse.json()).toEqual(payload);
    });
  });

  test('API-02 updates an existing booking with PUT', async ({ booking, authorizedBookingClient, bookingClient, bookingCleanup }) => {
    const original = booking.payload;

    const changes = await test.step('Arrange: build update payload and verify ownership', async (step) => {
      await attachJson(step, 'initial-booking', { bookingId: booking.id, payload: original });
      const changes = BookingFactory.build(
        { totalprice: original.totalprice + 50, depositpaid: !original.depositpaid, additionalneeds: 'Late checkout' },
        { daysAhead: 60, nights: 5 },
      );
      await attachJson(step, 'update-payload', changes);
      const unchangedFields = Object.keys(changes).filter((key) => JSON.stringify(changes[key]) === JSON.stringify(original[key]));
      expect(unchangedFields, 'every field of the update payload must differ from the original').toEqual([]);
      await bookingCleanup.assertOwnership(booking.id);
      bookingCleanup.recordUpdate(booking.id, changes);
      return changes;
    });

    const updateResponse = await test.step('Act: PUT /booking/:id', async (step) => {
      const updateResponse = await authorizedBookingClient.update(booking.id, changes);
      await attachResponse(step, 'PUT /booking/:id response', updateResponse, { method: 'PUT', ownedPayloads: [original, changes] });
      return updateResponse;
    });

    await test.step('Assert: PUT returns the updated booking', async () => {
      expect(updateResponse.status(), 'PUT /booking/:id status').toBe(200);
      expect(await updateResponse.json()).toEqual(changes);
    });

    await test.step('Assert: GET /booking/:id returns the persisted update', async (step) => {
      const getResponse = await bookingClient.get(booking.id);
      const getEvidence = await attachResponse(step, 'GET /booking/:id response', getResponse, { method: 'GET', ownedPayloads: [original, changes] });
      await attachJson(step, 'persistence-comparison', persistenceComparison(changes, getEvidence));
      expect(getResponse.status(), 'GET /booking/:id status').toBe(200);
      expect(await getResponse.json()).toEqual(changes);
    });
  });

  test('API-03 deletes an existing booking', async ({ booking, authorizedBookingClient, bookingClient, bookingCleanup }) => {
    await test.step('Arrange: verify ownership of the target booking', async (step) => {
      await attachJson(step, 'target-booking', { bookingId: booking.id });
      await bookingCleanup.assertOwnership(booking.id);
    });

    const deleteResponse = await test.step('Act: DELETE /booking/:id', async (step) => {
      const deleteResponse = await authorizedBookingClient.delete(booking.id);
      await attachResponse(step, 'DELETE /booking/:id response', deleteResponse, { method: 'DELETE', ownedPayloads: [booking.payload] });
      return deleteResponse;
    });

    await test.step('Assert: DELETE returns 201', async () => {
      expect(deleteResponse.status(), 'DELETE /booking/:id status (Restful-Booker documents 201 Created)').toBe(201);
    });

    await test.step('Assert: GET /booking/:id returns 404', async (step) => {
      const getResponse = await bookingClient.get(booking.id);
      await attachResponse(step, 'GET /booking/:id after delete', getResponse, { method: 'GET', ownedPayloads: [booking.payload] });
      await attachJson(step, 'deletion-confirmation', { bookingId: booking.id, getStatus: getResponse.status(), absent: getResponse.status() === 404 });
      expect(getResponse.status(), 'GET /booking/:id after delete').toBe(404);
    });
  });
});
