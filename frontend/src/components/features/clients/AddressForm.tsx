/**
 * AddressForm Component
 *
 * Modal form for adding or editing client addresses.
 * Supports home, work, billing, and shipping addresses with full address fields.
 */

import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Home,
  Briefcase,
  CreditCard,
  Package,
  Star,
  Globe,
} from 'lucide-react';
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
} from '../../ui/Modal';
import { AppButton } from '../../ui/AppButton';
import { AppInput } from '../../ui/AppInput';
import { useToast } from '../../ui/Toast';
import { clientService } from '../../../services/clientService';
import type {
  ClientAddress,
  AddressType,
  AddAddressRequest,
  UpdateAddressRequest,
} from '../../../types/client';

/* =============================================================================
   Types
   ============================================================================= */

interface AddressFormProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal closes */
  onClose: () => void;
  /** Workspace ID */
  workspaceId: string;
  /** Client ID */
  clientId: string;
  /** Address to edit (if editing) */
  address?: ClientAddress;
  /** Callback after successful save */
  onSaved?: () => void;
}

interface AddressTypeOption {
  value: AddressType;
  label: string;
  icon: React.ElementType;
  description: string;
}

/* =============================================================================
   Address Type Configuration
   ============================================================================= */

const ADDRESS_TYPES: AddressTypeOption[] = [
  {
    value: 'home',
    label: 'Home',
    icon: Home,
    description: 'Personal residence address',
  },
  {
    value: 'work',
    label: 'Work',
    icon: Briefcase,
    description: 'Business or office address',
  },
  {
    value: 'billing',
    label: 'Billing',
    icon: CreditCard,
    description: 'Billing and payment address',
  },
  {
    value: 'shipping',
    label: 'Shipping',
    icon: Package,
    description: 'Delivery and shipping address',
  },
];

// Common countries list (can be expanded)
const COUNTRIES = [
  'United States',
  'Canada',
  'United Kingdom',
  'Australia',
  'India',
  'Germany',
  'France',
  'Italy',
  'Spain',
  'Mexico',
  'Brazil',
  'Other',
];

/* =============================================================================
   AddressForm Component
   ============================================================================= */

export const AddressForm: React.FC<AddressFormProps> = ({
  isOpen,
  onClose,
  workspaceId,
  clientId,
  address,
  onSaved,
}) => {
  const { addToast } = useToast();
  const isEditing = !!address;

  // Form state
  const [addressType, setAddressType] = useState<AddressType>('home');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('United States');
  const [googleMapLink, setGoogleMapLink] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);

  // Initialize form with address data (if editing)
  useEffect(() => {
    if (isOpen && address) {
      setAddressType(address.address_type);
      setAddressLine1(address.address_line1 || '');
      setAddressLine2(address.address_line2 || '');
      setCity(address.city || '');
      setState(address.state || '');
      setPostalCode(address.postal_code || '');
      setCountry(address.country || 'United States');
      setGoogleMapLink(address.google_map_link || '');
      setIsPrimary(address.is_primary);
    } else if (isOpen && !address) {
      // Reset for new address
      setAddressType('home');
      setAddressLine1('');
      setAddressLine2('');
      setCity('');
      setState('');
      setPostalCode('');
      setCountry('United States');
      setGoogleMapLink('');
      setIsPrimary(false);
    }
  }, [isOpen, address]);

  // Get current address type config
  const currentTypeConfig = ADDRESS_TYPES.find((t) => t.value === addressType);
  const Icon = currentTypeConfig?.icon || MapPin;

  // Validate form
  const isFormValid =
    addressLine1.trim().length > 0 &&
    city.trim().length > 0 &&
    state.trim().length > 0 &&
    postalCode.trim().length > 0 &&
    country.trim().length > 0;

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isFormValid) {
      addToast({
        variant: 'error',
        message: 'Please fill in all required address fields',
      });
      return;
    }

    setLoading(true);

    try {
      const payload = {
        address_type: addressType,
        address_line1: addressLine1.trim(),
        address_line2: addressLine2.trim() || undefined,
        city: city.trim(),
        state: state.trim(),
        postal_code: postalCode.trim(),
        country: country.trim(),
        google_map_link: googleMapLink.trim() || undefined,
        is_primary: isPrimary,
      };

      if (isEditing && address) {
        // Update existing address
        await clientService.updateAddress(
          workspaceId,
          clientId,
          address.address_id,
          payload as UpdateAddressRequest
        );

        addToast({
          variant: 'success',
          message: 'Address updated successfully',
        });
      } else {
        // Add new address
        await clientService.addAddress(workspaceId, clientId, payload as AddAddressRequest);

        addToast({
          variant: 'success',
          message: 'Address added successfully',
        });
      }

      // Close modal and trigger callback
      onClose();
      onSaved?.();
    } catch (error) {
      addToast({
        variant: 'error',
        message: error instanceof Error ? error.message : 'Failed to save address',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <form onSubmit={handleSubmit}>
        <ModalHeader>
          <ModalTitle>{isEditing ? 'Edit Address' : 'Add Address'}</ModalTitle>
        </ModalHeader>

        <ModalBody>
          <div className="space-y-4">
            {/* Address Type */}
            <div>
              <label htmlFor="address-type" className="block text-sm font-medium text-gray-700 mb-2">
                Type <span className="text-red-500">*</span>
              </label>
              <select
                id="address-type"
                value={addressType}
                onChange={(e) => setAddressType(e.target.value as AddressType)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                {ADDRESS_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label} - {type.description}
                  </option>
                ))}
              </select>
            </div>

            {/* Address Line 1 */}
            <div>
              <AppInput
                type="text"
                label="Address Line 1"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                placeholder="123 Main Street"
                leftIcon={<MapPin className="h-4 w-4" />}
                required
              />
            </div>

            {/* Address Line 2 */}
            <div>
              <AppInput
                type="text"
                label="Address Line 2 (Optional)"
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
                placeholder="Apt 4B, Suite 100, etc."
              />
            </div>

            {/* City & State */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <AppInput
                  type="text"
                  label="City"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="San Francisco"
                  required
                />
              </div>

              <div>
                <AppInput
                  type="text"
                  label="State / Province"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="CA"
                  required
                />
              </div>
            </div>

            {/* Postal Code & Country */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <AppInput
                  type="text"
                  label="Postal Code"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="94102"
                  required
                />
              </div>

              <div>
                <label htmlFor="country" className="block text-sm font-medium text-gray-700 mb-2">
                  Country <span className="text-red-500">*</span>
                </label>
                <select
                  id="country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Google Map Link */}
            <div>
              <AppInput
                type="url"
                label="Google Maps Link (Optional)"
                value={googleMapLink}
                onChange={(e) => setGoogleMapLink(e.target.value)}
                placeholder="https://maps.google.com/..."
                leftIcon={<Globe className="h-4 w-4" />}
              />
            </div>

            {/* Primary Toggle */}
            <div className="border-t border-gray-200 pt-4">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPrimary}
                  onChange={(e) => setIsPrimary(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <div className="flex items-center space-x-2">
                  <Star className="h-4 w-4 text-yellow-500" />
                  <span className="text-sm font-medium text-gray-700">Set as primary address</span>
                </div>
              </label>
              <p className="text-xs text-gray-500 mt-1 ml-7">
                This will be the main {currentTypeConfig?.label.toLowerCase()} address for the client
              </p>
            </div>
          </div>
        </ModalBody>

        <ModalFooter>
          <AppButton variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </AppButton>
          <AppButton
            type="submit"
            variant="primary"
            isLoading={loading}
            disabled={!isFormValid}
            leftIcon={<Icon className="h-4 w-4" />}
          >
            {isEditing ? 'Update Address' : 'Add Address'}
          </AppButton>
        </ModalFooter>
      </form>
    </Modal>
  );
};
