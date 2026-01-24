import React from 'react';
import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * CrossLinkCard Component
 *
 * Interactive card that links to related settings in another scope.
 * Provides visual navigation between personal and workspace settings.
 */

interface CrossLinkCardProps {
  /**
   * Title of the related settings
   */
  title: string;
  /**
   * Description explaining what this link provides
   */
  description: string;
  /**
   * Icon to display (typically from lucide-react)
   */
  icon: React.ReactNode;
  /**
   * Path to navigate to when clicked
   */
  path: string;
}

export const CrossLinkCard: React.FC<CrossLinkCardProps> = ({
  title,
  description,
  icon,
  path,
}) => {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(path);
  };

  return (
    <button
      onClick={handleClick}
      className="w-full text-left p-4 rounded-xl glass-light hover:bg-white/10 transition-all duration-200 border border-white/10 hover:border-primary/30 group"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5 p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-text-primary group-hover:text-primary transition-colors">
              {title}
            </h3>
            <ArrowRight
              size={14}
              className="text-text-tertiary group-hover:text-primary transition-colors flex-shrink-0"
            />
          </div>
          <p className="text-xs text-text-secondary mt-0.5">{description}</p>
        </div>
      </div>
    </button>
  );
};

export default CrossLinkCard;
