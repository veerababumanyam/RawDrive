/**
 * AddressesSection Component
 *
 * Displays and manages client physical addresses.
 * Supports multiple addresses per client (home, work, billing, shipping).
 */

import React, { useState } from 'react';
import {
  MapPin,
  Home,
  Briefcase,
  CreditCard,
  Package,
  Copy,
  CheckCircle,
  Plus,
  Edit,
  Trash2,
  Star,
} from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { AppBadge } from '../../ui/AppBadge';
import { useToast } from '../../ui/Toast';
import { ConfirmDialog } from '../../ui/Modal';
import { clientService } from '../../../services/clientService';
import type { ClientAddress, AddressType } from '../../../types/client';

/* =============================================================================
   Types
   ============================================================================= */

interface AddressesSectionProps {
  /** Workspace ID */
  workspaceId: string;
  /** Client ID */
  clientId: string;
  /** Array of client addresses */
  addresses: ClientAddress[];
  /** Callback when addresses are modified */
  onAddressesChanged?: () => void;
  /** Callback to open address form */
  onAddAddress?: () => void;
  /** Callback to edit address */
  onEditAddress?: (address: ClientAddress) => void;
  /** Whether the section is read-only */
  readOnly?: boolean;
}

/* =============================================================================
   Address Icon & Label Mapping
   ============================================================================= */

const getAddressIcon = (type: AddressType): React.ElementType => {
  const iconMap: Record<AddressType, React.ElementType> = {
    home: Home,
    work: Briefcase,
    billing: CreditCard,
    shipping: Package,
  };

  return iconMap[type] || MapPin;
};

const getAddressTypeLabel = (type: AddressType): string => {
  const labelMap: Record<AddressType, string> = {
    home: 'Home',
    work: 'Work',
    billing: 'Billing',
    shipping: 'Shipping',
  };

  return labelMap[type];
};

const getAddressColor = (type: AddressType): string => {
  const colorMap: Record<AddressType, string> = {
    home: 'text-blue-600 bg-blue-100',
    work: 'text-purple-600 bg-purple-100',
    billing: 'text-green-600 bg-green-100',
    shipping: 'text-orange-600 bg-orange-100',
  };

  return colorMap[type];
};

/* =============================================================================
   AddressesSection Component
   ============================================================================= */

export const AddressesSection: React.FC<AddressesSectionProps> = ({
  workspaceId,
  clientId,
  addresses,
  onAddressesChanged,
  onAddAddress,
  onEditAddress,
  readOnly = false,
}) => {
  const { addToast } = useToast();

  // State
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Format address for display
  const formatAddress = (address: ClientAddress): string => {
    const parts: string[] = [];

    if (address.address_line1) parts.push(address.address_line1);
    if (address.address_line2) parts.push(address.address_line2);

    const cityStateZip: string[] = [];
    if (address.city) cityStateZip.push(address.city);
    if (address.state) cityStateZip.push(address.state);
    if (address.postal_code) cityStateZip.push(address.postal_code);

    if (cityStateZip.length > 0) {
      parts.push(cityStateZip.join(', '));
    }

    if (address.country) parts.push(address.country);

    return parts.join('\n');
  };

  // Format single-line address
  const formatAddressSingleLine = (address: ClientAddress): string => {
    return formatAddress(address).replace(/\n/g, ', ');
  };

  // Copy to clipboard
  const handleCopy = async (address: ClientAddress) => {
    try {
      const formattedAddress = formatAddressSingleLine(address);
      await navigator.clipboard.writeText(formattedAddress);
      setCopiedValue(address.address_id);
      addToast({
        variant: 'success',
        message: 'Address copied to clipboard',
      });

      // Reset after 2 seconds
      setTimeout(() => {
        setCopiedValue(null);
      }, 2000);
    } catch (error) {
      addToast({
        variant: 'error',
        message: 'Failed to copy to clipboard',
      });
    }
  };

  // Delete address
  const handleDelete = async (addressId: string) => {
    setDeleting(true);

    try {
      await clientService.deleteAddress(workspaceId, clientId, addressId);

      addToast({
        variant: 'success',
        message: 'Address deleted successfully',
      });

      setDeleteConfirm(null);
      onAddressesChanged?.();
    } catch (error) {
      addToast({
        variant: 'error',
        message: error instanceof Error ? error.message : 'Failed to delete address',
      });
    } finally {
      setDeleting(false);
    }
  };

  // Open in maps
  const openInMaps = (address: ClientAddress) => {
    const query = encodeURIComponent(formatAddressSingleLine(address));
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Addresses</h3>
        {!readOnly && onAddAddress && (
          <AppButton onClick={onAddAddress} size="sm" leftIcon={<Plus className="h-4 w-4" />}>
            Add Address
          </AppButton>
        )}
      </div>

      {/* Addresses List */}
      {addresses.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <MapPin className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-4">No addresses yet</p>
          {!readOnly && onAddAddress && (
            <AppButton onClick={onAddAddress} size="sm">
              Add First Address
            </AppButton>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {addresses.map((address) => {
            const Icon = getAddressIcon(address.address_type);
            const colorClasses = getAddressColor(address.address_type);
            const typeLabel = getAddressTypeLabel(address.address_type);
            const formattedAddress = formatAddress(address);
            const isCopied = copiedValue === address.address_id;
            const hasCompleteAddress = address.address_line1 && address.city && address.state;

            return (
              <div
                key={address.address_id}
                className="flex items-start justify-between p-4 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
              >
                {/* Left: Icon, Type, Address */}
                <div className="flex items-start space-x-3 flex-1 min-w-0">
                  {/* Icon */}
                  <div className={`flex-shrink-0 w-10 h-10 rounded-full ${colorClasses} flex items-center justify-center`}>
                    <Icon className="h-5 w-5" />
                  </div>

                  {/* Type & Address */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-xs font-medium text-gray-500 uppercase">
                        {typeLabel}
                      </span>
                      {address.is_primary && (
                        <AppBadge variant="primary" size="sm" icon={<Star className="h-3 w-3" />}>
                          Primary
                        </AppBadge>
                      )}
                    </div>

                    <div className="text-sm text-gray-900 whitespace-pre-line">
                      {formattedAddress || (
                        <span className="text-gray-400 italic">Address details incomplete</span>
                      )}
                    </div>

                    {/* View on Maps Link */}
                    {hasCompleteAddress && (
                      <button
                        onClick={() => openInMaps(address)}
                        className="text-xs text-blue-600 hover:text-blue-700 hover:underline mt-2 inline-flex items-center"
                      >
                        <MapPin className="h-3 w-3 mr-1" />
                        View on Google Maps
                      </button>
                    )}
                  </div>
                </div>

                {/* Right: Actions */}
                {!readOnly && (
                  <div className="flex items-center space-x-1 ml-2">
                    {/* Copy Button */}
                    <AppButton
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopy(address)}
                      title="Copy address"
                      disabled={!hasCompleteAddress}
                    >
                      {isCopied ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </AppButton>

                    {/* Edit Button */}
                    {onEditAddress && (
                      <AppButton
                        variant="ghost"
                        size="icon"
                        onClick={() => onEditAddress(address)}
                        title="Edit address"
                      >
                        <Edit className="h-4 w-4" />
                      </AppButton>
                    )}

                    {/* Delete Button */}
                    <AppButton
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteConfirm(address.address_id)}
                      title="Delete address"
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </AppButton>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setDeleteConfirm(null)}
          onConfirm={() => handleDelete(deleteConfirm)}
          title="Delete Address"
          message="Are you sure you want to delete this address? This action cannot be undone."
          confirmText="Delete"
          cancelText="Cancel"
          variant="destructive"
          isLoading={deleting}
        />
      )}
    </div>
  );
};
